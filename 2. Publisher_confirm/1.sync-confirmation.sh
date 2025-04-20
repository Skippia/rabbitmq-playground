#!/bin/sh
set -e

docker-compose -f ./1.sync-confirmation/docker-compose.yml up rabbitmq -d \
  && sleep 10 \
  && dotenv -e ./1.sync-confirmation/.env -- envsubst < ./init.sh | docker exec -i rabbitmq-publisher sh \
  && docker-compose -f ./1.sync-confirmation/docker-compose.yml up publisher \


