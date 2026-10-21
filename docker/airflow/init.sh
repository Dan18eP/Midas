#!/bin/bash
set -e

airflow db migrate

if ! airflow users list --output json | python -c "import json,sys; users=json.load(sys.stdin); sys.exit(0 if any(user.get('username') == '${AIRFLOW_ADMIN_USERNAME}' for user in users) else 1)"; then
  airflow users create \
    --username "${AIRFLOW_ADMIN_USERNAME}" \
    --password "${AIRFLOW_ADMIN_PASSWORD}" \
    --firstname "Midas" \
    --lastname "Admin" \
    --role Admin \
    --email "${AIRFLOW_ADMIN_EMAIL}"
fi
