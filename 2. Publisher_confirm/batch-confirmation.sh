#!/bin/sh
set -e

docker-compose -f ./2.batch-confirmation/docker-compose.yml up rabbitmq -d \
  && sleep 10 \
  && dotenv -e ./1.consumer-single/.env -- envsubst < ./1.consumer-single/init.sh | docker exec -i rabbitmq sh \
  && docker exec -it rabbitmq rabbitmqctl set_policy orders_queue_min "^q.external$" \
    '{"max-length": 0, "overflow": "reject-publish"}' \
    --priority 1 \
    --apply-to queues \
  && docker-compose -f ./local-publisher/docker-compose.yml up publisher \
  # && docker-compose -f ./1.consumer-single/docker-compose.yml up


