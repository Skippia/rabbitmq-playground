docker-compose -f ./local-publisher/docker-compose.yml up rabbitmq -d \
  && sleep 10 \
  && dotenv -e ./1.consumer-single/.env -- envsubst < ./1.consumer-single/init.sh | docker exec -i rabbitmq sh \
  && docker-compose -f ./local-publisher/docker-compose.yml up publisher -d \
  && docker-compose -f ./1.consumer-single/docker-compose.yml up
