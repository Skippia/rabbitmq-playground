# 1. consumer single 

## Publishing

- Retries amount = 2 (1000ms, 2000ms)

### Default channel (no confirmation)
- *0% retries*
  - 60k MPS

### Sync confirmation
- *0% retries*
  - 150(!) MPS
- *10% retries*
  - ?
- *100% retries*
  - ? 

### Async confirmation

- *0% retries*
  - 40k MPS
- *10% retries*
  - max concurrent handlers:
    - 10(3) -  MPS ( MB)
    - 100(33) -  MPS ( MB)
    - 300(100) - MPS ( MB)
- *100% retries*
  - max concurrent handlers:
    - 10(3) - 5k MPS (900 MB)
    - 100(33) - 5.5k MPS (1100 MB)
    - 300(100) - 6.2k MPS (1000 MB)

### Batch confirmation

<!-- table -->



## Consuming
- Auto ACK
  - 90k MPS
- Manual ACK
  - prefetch=1 => 4.7k (12% consumption capacity)
  - prefetch=10 => 22k (36% consumption capacity)
  - prefetch=100 => 55k (70% consumption capacity)

