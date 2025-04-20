#!/bin/sh
set -e

docker-compose -f ./2.batch-confirmation/docker-compose.yml up rabbitmq -d \
  && sleep 10 \
  && dotenv -e ./2.batch-confirmation/.env -- envsubst < ./init.sh | docker exec -i rabbitmq-publisher sh \
  && docker exec -it rabbitmq-publisher rabbitmqctl set_policy orders_queue_min "^q.external$" \
    '{"max-length": 0, "overflow": "reject-publish"}' \
    --priority 1 \
    --apply-to queues \
  && docker-compose -f ./2.batch-confirmation/docker-compose.yml up publisher \


