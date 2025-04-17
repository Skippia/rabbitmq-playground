### Add nodes to cluster (to rabbitmq1)
npm run clusterize


### Replicate classic queue across rest nodes
cat ./scripts/2.replicate-classic-queue.sh | d exec -i rabbitmq1 sh


### Shovel
npm run setup-shovels


### Reset rabbitmq cluster
npm run clean
