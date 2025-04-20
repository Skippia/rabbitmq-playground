#!/bin/sh
set -e

rabbitmqadmin -u ${USERNAME} -p ${PASSWORD} declare queue \
  name=${QUEUE}
  durable=true \

rabbitmqadmin -u ${USERNAME} -p ${PASSWORD} declare queue \
  name=${QUEUE_NORMAL}
  durable=true \

