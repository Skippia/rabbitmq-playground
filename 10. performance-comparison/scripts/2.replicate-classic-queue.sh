#!/bin/sh

rabbitmqadmin -u rmuser -p rmpassword declare queue name=classic1 durable=true auto_delete=false

# All queues in cluster are replicated at-least to 2 nodes with sync replication
rabbitmqctl set_policy ha-all ".*" '{"ha-mode":"exactly","ha-params":2,"ha-sync-mode":"automatic"}' \
  --priority 1 \
  --apply-to queues


