#!/bin/sh
set -e

rabbitmqctl set_parameter shovel my-shovel "{
  \"src-protocol\": \"amqp091\",
  \"src-uri\": \"${SRC_URI}\",
  \"src-queue\": \"q.external\",
  \"src-prefetch-count\": 0,
  \"src-delete-after\": \"never\",
  \"dest-protocol\": \"amqp091\",
  \"dest-uri\": \"amqp://\",
  \"dest-exchange\": \"ex.from-external\",
  \"dest-exchange-key\": \"from-external\",
  \"dest-add-forward-headers\": false,
  \"ack-mode\": \"on-confirm\",
  \"reconnect-delay\": 10
}"
rabbitmqadmin -u rmuser -p rmpassword declare exchange \
  name=ex.from-external \
  durable=true \
  type=direct

rabbitmqadmin -u rmuser -p rmpassword declare queue \
  name=q.from-external \
  durable=true \
  arguments='{"x-queue-type": "quorum"}'

rabbitmqadmin -u rmuser -p rmpassword declare binding \
  source=ex.from-external \
  destination=q.from-external \
  destination_type=queue \
  routing_key=from-external
