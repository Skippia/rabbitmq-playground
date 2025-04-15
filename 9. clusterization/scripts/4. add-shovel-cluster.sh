#!/bin/sh

rabbitmqadmin -u rmuser -p rmpassword declare exchange \ 
  --name ex.from-external \ 
  --durable true \
  --type direct

rabbitmqadmin -u rmuser -p rmpassword declare queue \ 
  --name q.from-external \ 
  --durable true \

rabbitmqadmin -u rmuser -p rmpassword declare binding \
  --source ex.from-external \
  --destination q.from-external \
  --destination-type queue \
  --routing-key from-external
