#!/bin/bash
# Throwaway: Postgres + GoTrue v2.197.0 (production's version) + Mailpit, on their own network.
set -e
N=ae-auth-repro
docker network create $N >/dev/null
docker run -d --name ${N}-db --network $N -e POSTGRES_PASSWORD=postgres public.ecr.aws/supabase/postgres:17.6.1.165 >/dev/null
docker run -d --name ${N}-mail --network $N -p 127.0.0.1:54891:8025 public.ecr.aws/supabase/mailpit:v1.30.2 >/dev/null
for i in $(seq 1 60); do docker exec ${N}-db pg_isready -U postgres -h localhost >/dev/null 2>&1 && break; sleep 2; done
sleep 5
docker run -d --name ${N}-auth --network $N -p 127.0.0.1:54890:9999 \
  -e GOTRUE_API_HOST=0.0.0.0 -e GOTRUE_API_PORT=9999 -e API_EXTERNAL_URL=http://127.0.0.1:54890 \
  -e GOTRUE_DB_DRIVER=postgres -e GOTRUE_DB_DATABASE_URL=postgresql://supabase_auth_admin:postgres@${N}-db:5432/postgres \
  -e GOTRUE_SITE_URL=http://localhost:3000 -e GOTRUE_JWT_SECRET=repro-secret-repro-secret-repro-secret-00 \
  -e GOTRUE_JWT_AUD=authenticated -e GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated -e GOTRUE_JWT_EXP=3600 -e GOTRUE_JWT_ADMIN_ROLES=service_role \
  -e GOTRUE_DISABLE_SIGNUP=false -e GOTRUE_EXTERNAL_EMAIL_ENABLED=true -e GOTRUE_EXTERNAL_PHONE_ENABLED=false \
  -e GOTRUE_MAILER_AUTOCONFIRM=false -e GOTRUE_MAILER_OTP_LENGTH=8 -e GOTRUE_MAILER_OTP_EXP=3600 \
  -e GOTRUE_SMTP_HOST=${N}-mail -e GOTRUE_SMTP_PORT=1025 -e GOTRUE_SMTP_ADMIN_EMAIL=admin@example.test -e GOTRUE_SMTP_MAX_FREQUENCY=1s \
  -e GOTRUE_RATE_LIMIT_EMAIL_SENT=360000 -e GOTRUE_RATE_LIMIT_VERIFY=1000 -e GOTRUE_RATE_LIMIT_OTP=1000 \
  -e GOTRUE_MAILER_URLPATHS_CONFIRMATION=/verify -e GOTRUE_MAILER_URLPATHS_RECOVERY=/verify -e GOTRUE_MAILER_URLPATHS_INVITE=/verify -e GOTRUE_MAILER_URLPATHS_EMAIL_CHANGE=/verify \
  public.ecr.aws/supabase/gotrue:v2.197.0 >/dev/null
for i in $(seq 1 60); do curl -sf http://127.0.0.1:54890/health >/dev/null && break; sleep 2; done
curl -s http://127.0.0.1:54890/health; echo
