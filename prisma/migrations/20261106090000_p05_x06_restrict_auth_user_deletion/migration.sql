-- P05 X06: preserve auth child records when restricting principal deletion.
ALTER TABLE "core"."session"
  DROP CONSTRAINT "session_userId_fkey";
ALTER TABLE "core"."session"
  ADD CONSTRAINT "session_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "core"."user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "core"."account"
  DROP CONSTRAINT "account_userId_fkey";
ALTER TABLE "core"."account"
  ADD CONSTRAINT "account_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "core"."user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
