### Add nodes to cluster (to rabbitmq1)

cat ./1. join-cluster.sh | d exec -i rabbitmq1 sh
cat ./1. join-cluster.sh | d exec -i rabbitmq2 sh
cat ./1. join-cluster.sh | d exec -i rabbitmq3 sh

### Replicate classic queue across rest nodes
cat ./2. replicate-classic-queue.sh | d exec -i rabbitmq1 sh


### Shovel
cat ./3. add-shovel-external.sh | d exec -i rabbitmq-external sh
cat ./4. add-shovel-cluster.sh | d exec -i rabbitmq1 sh


### Reset rabbitmq cluster
docker rm rabbitmq1 -f && docker rm rabbitmq2 -f && docker rm rabbitmq3 -f
sudo rm -rf ./rabbitmq-1 && sudo rm -rf ./rabbitmq-2 && sudo rm -rf ./rabbitmq-3
