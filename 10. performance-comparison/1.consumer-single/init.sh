#!/bin/sh
set -e

rabbitmqadmin -u ${FROM_USERNAME} -p ${FROM_PASSWORD} declare queue \
  name=${FROM_QUEUE}
  durable=true \

