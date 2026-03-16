"""ClaudeCLIProcessor — Custom Pipecat FrameProcessor that routes LLM calls to Claude CLI.

Replaces GroqLLMService in the Pipecat pipeline. Receives aggregated context
(system prompt + conversation history) from the LLM context aggregator, spawns
Claude CLI with stream-json output, and emits LLMTextFrame chunks that feed
into CartesiaTTS for streaming synthesis.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from typing import Any, Optional

from pipecat.frames.frames import (
    Frame,
    LLMFullResponseEndFrame,
    LLMFullResponseStartFrame,
    LLMMessagesFrame,
    LLMTextFrame,
    TextFrame,
)
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor

from config import settings

logger = logging.getLogger(__name__)


class ClaudeCLIProcessor(FrameProcessor):
    """Pipecat processor that sends LLM requests to Claude via CLI spawn.

    Pipeline position: after user context aggregator, before TTS.

    Input frames:
        - LLMMessagesFrame: contains the full messages array (system + history + user)

    Output frames:
        - LLMFullResponseStartFrame: signals start of response
        - LLMTextFrame: streamed text chunks (feeds CartesiaTTS)
        - LLMFullResponseEndFrame: signals end of response
    """

    def __init__(self, model: str = "sonnet", **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self._model = model
        self._active_process: Optional[asyncio.subprocess.Process] = None
        self._cancel_event = asyncio.Event()

    async def process_frame(self, frame: Frame, direction: FrameDirection) -> None:
        await super().process_frame(frame, direction)

        if isinstance(frame, LLMMessagesFrame):
            await self._handle_llm_request(frame)
        else:
            await self.push_frame(frame, direction)

    async def _handle_llm_request(self, frame: LLMMessagesFrame) -> None:
        """Process an LLM request by spawning Claude CLI."""
        self._cancel_event.clear()
        messages = frame.messages

        # Build prompt from messages array
        prompt = self._build_prompt(messages)

        logger.info(
            "[claude-cli] Processing request (%d messages, %d chars)",
            len(messages),
            len(prompt),
        )

        start_time = time.perf_counter()
        first_token_emitted = False

        try:
            # Signal response start
            await self.push_frame(LLMFullResponseStartFrame())

            # Spawn Claude CLI
            clean_env = {**os.environ}
            clean_env.pop("CLAUDECODE", None)

            self._active_process = await asyncio.create_subprocess_exec(
                "claude",
                "--model", self._model,
                "--print",
                "--verbose",
                "--max-turns", "1",
                "--output-format", "stream-json",
                "--include-partial-messages",
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=clean_env,
                cwd="/tmp",
            )

            # Send prompt via stdin
            assert self._active_process.stdin is not None
            self._active_process.stdin.write(prompt.encode("utf-8"))
            await self._active_process.stdin.drain()
            self._active_process.stdin.close()

            # Parse stream-json events line by line
            assert self._active_process.stdout is not None
            last_text_len = 0
            full_response = ""

            async for raw_line in self._active_process.stdout:
                if self._cancel_event.is_set():
                    logger.info("[claude-cli] Cancelled (barge-in)")
                    self._active_process.terminate()
                    break

                line = raw_line.decode("utf-8").strip()
                if not line:
                    continue

                try:
                    event = json.loads(line)
                except json.JSONDecodeError:
                    continue

                event_type = event.get("type")

                # Extract incremental text from assistant events
                if event_type == "assistant":
                    message = event.get("message", {})
                    content_blocks = message.get("content", [])
                    for block in content_blocks:
                        if block.get("type") == "text":
                            full_text = block.get("text", "")
                            # Emit only the NEW characters since last update
                            if len(full_text) > last_text_len:
                                delta = full_text[last_text_len:]
                                last_text_len = len(full_text)
                                full_response = full_text

                                if not first_token_emitted:
                                    elapsed = (time.perf_counter() - start_time) * 1000
                                    logger.info(
                                        "[claude-cli] First token: %.0fms", elapsed
                                    )
                                    first_token_emitted = True

                                await self.push_frame(
                                    LLMTextFrame(text=delta)
                                )

                elif event_type == "result":
                    # Final result — extract any remaining text
                    result_text = event.get("result", "")
                    if isinstance(result_text, str) and len(result_text) > last_text_len:
                        delta = result_text[last_text_len:]
                        await self.push_frame(LLMTextFrame(text=delta))
                        full_response = result_text

            # Wait for process to finish
            await self._active_process.wait()

            elapsed = (time.perf_counter() - start_time) * 1000
            logger.info(
                "[claude-cli] Complete: %.0fms, %d chars",
                elapsed,
                len(full_response),
            )

        except asyncio.CancelledError:
            if self._active_process:
                self._active_process.terminate()
            raise

        except Exception as e:
            logger.error("[claude-cli] Error: %s", e)
            # Emit fallback text so TTS gives the user feedback
            await self.push_frame(
                LLMTextFrame(text="I'm having a moment — could you say that again?")
            )

        finally:
            self._active_process = None
            await self.push_frame(LLMFullResponseEndFrame())

    def _build_prompt(self, messages: list[dict[str, Any]]) -> str:
        """Convert Pipecat messages array into a single prompt string for Claude CLI.

        Claude CLI receives the full conversation via stdin. We format it as:
        - System messages become a preamble
        - User/assistant messages become the conversation
        """
        parts: list[str] = []
        system_parts: list[str] = []

        for msg in messages:
            role = msg.get("role", "")
            content = msg.get("content", "")

            if role == "system":
                system_parts.append(content)
            elif role == "user":
                parts.append(f"User: {content}")
            elif role == "assistant":
                parts.append(f"Assistant: {content}")

        # Assemble: system context first, then conversation, then instruction
        prompt_parts: list[str] = []

        if system_parts:
            prompt_parts.append("\n\n".join(system_parts))
            prompt_parts.append("")  # blank line separator

        if parts:
            prompt_parts.append("\n".join(parts))

        return "\n".join(prompt_parts)

    def cancel(self) -> None:
        """Cancel the current Claude CLI request (for barge-in)."""
        self._cancel_event.set()
        if self._active_process:
            try:
                self._active_process.terminate()
            except ProcessLookupError:
                pass
