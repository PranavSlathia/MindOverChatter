CREATE UNIQUE INDEX "user_formulations_user_id_version_unique" ON "user_formulations" USING btree ("user_id","version");
