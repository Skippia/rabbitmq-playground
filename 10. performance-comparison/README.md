## 1. consumer single 
### Publishing
- 60k messages per second - default channel
- 150(!) messages per second - confirm channel

### Consuming
- Auto ACK
  - 90k messages per second
- Manual ACK
  - prefetch=1 => 4.7k (12% consumption capacity)
  - prefetch=10 => 22k (36% consumption capacity)
  - prefetch=100 => 55k (70% consumption capacity)

## 2. consumer with 3 shards
## 3. consumer with 3 shards
## 2. consumer with 3 shards


