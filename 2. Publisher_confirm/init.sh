#!/bin/sh
set -e

rabbitmqadmin -u ${USERNAME} -p ${PASSWORD} declare queue \
  name=${FROM_QUEUE}
  durable=true \

rabbitmqadmin -u ${FROM_USERNAME} -p ${FROM_PASSWORD} declare queue \
  name=${FROM_QUEUE_NORMAL}
  durable=true \

