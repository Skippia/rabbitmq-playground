# RabbitMQ Deep Dive - Todo List

## Core concepts

- **1. Pub-Sub:**  
  Demonstrates a publish-subscribe pattern with **topic** / fanout exchanges for message broadcasting.

- **2. Publisher Confirm:**  
  Ensures message delivery reliability by using publisher confirms to receive acknowledgments.

- **3. RPC (Remote Procedure Call):**  
  Implements a request-response communication pattern over RabbitMQ with correlation IDs.

- **4. Alternative Exchange:**  
  Implements fallback routing for unroutable messages using an alternative exchange.

- **5. Consistent Hash Exchange:**  
  - *Description:* Distributes messages among queues based on a consistent hash algorithm for balanced load.
  - *Plugin*: `rabbitmq_consistent_hash_exchange`

- **6. DLX (Dead Letter Exchange):**  
  Routes undeliverable messages to a dead-letter exchange for error handling and retries (with exponential backoff?)

- **7. Delay Schedule:**
  - *Description:* Implements message delay to schedule messages for future processing.
  - *Based on custom implementation:* using TTL and dead-letter exchanges
  - *Based on plugin:* `rabbitmq_delayed_message_exchange`  
  
- **8. Event-based microservices:**
  Using RabbitMQ as event bus in Nestjs microservices


## Infra

1. **High Availability**
   - Implement mirrored queues with HA policies
   - Cluster setup with 3 nodes (document failover scenarios)
   - *Task*: Simulate node failure and observe recovery

2. **Quorum Queues**
   - Implement RAFT-based queues for data safety
   - *Task*: Compare performance vs classic mirrored queues
  
3. **Shovels & Federation**
   - Setup cross-cluster messaging
   - *Plugins*: `rabbitmq_shovel`, `rabbitmq_federation`
   - *Task*: Implement active-active disaster recovery
  
4. **Prometheus Metrics**
   - Setup monitoring with `rabbitmq_prometheus`
   - *Task*: Create Grafana dashboard for key metrics
   - *Alert*: Configure queue length/consumer count alerts


5. **Authentication & Authorization**
   - Setup TLS for encrypted connections
   - Implement OAuth2/JWT auth via `rabbitmq_auth_backend_http`
   - *Plugin*: `rabbitmq_auth_backend_oauth2`

## Advanced

1. **Priority Queues**
   - Implement message prioritization
   - *Task*: Test starvation scenarios with mixed priorities
  
2. **QoS (Quality of Service)**
   - Implement prefetch counts for consumer fairness
   - *Task*: Test with bursty loads and slow consumers

3. **Message Serialization**
    - Implement Avro/Protobuf serialization
    - *Task*: Add schema validation in consumers

  


- TLS (на плечах прокси) + Letsencrypt (certabot) + Haproxy + Cluster
  - 
. Haproxy + 3 instances by shards or
2.haproxy +lb cluster + 3 instances by shards / cluster(!)

- shards or clustering!
===Setup perf test to compare===


3. Single vs cluster queue perf test (mirrored queue vs quorum queue)
4.
