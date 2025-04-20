#!/bin/sh
set -e

docker-compose -f ./3.async-confirmation/docker-compose.yml up rabbitmq -d \
  && sleep 15 \
  && dotenv -e ./3.async-confirmation/.env -- envsubst < ./init.sh | docker exec -i rabbitmq-publisher sh \
  && docker exec -it rabbitmq-publisher rabbitmqctl set_policy orders_queue_min "^q.external$" \
    '{"max-length": 0, "overflow": "reject-publish"}' \
    --priority 1 \
    --apply-to queues \
  && docker-compose -f ./3.async-confirmation/docker-compose.yml up publisher \


