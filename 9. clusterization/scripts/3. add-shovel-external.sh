#!/bin/sh

rabbitmqadmin -u rmuser -p rmpassword declare queue name=q.external durable=true
