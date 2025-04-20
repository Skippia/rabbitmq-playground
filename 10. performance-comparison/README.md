# 1. consumer single 

## Publishing

### Default channel (no confirmation)
- *0% retries*
  - 60k MPS
- *10% retries*
  - ?
- *100% retries*
  - ?

### Sync confirmation
- *0% retries*
  - 150(!) MPS
- *10% retries*
  - ?
- *100% retries*
  - ? 

### Batch confirmation

<!-- table -->



## Consuming
- Auto ACK
  - 90k MPS
- Manual ACK
  - prefetch=1 => 4.7k (12% consumption capacity)
  - prefetch=10 => 22k (36% consumption capacity)
  - prefetch=100 => 55k (70% consumption capacity)

