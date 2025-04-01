import express from 'express'

import rabbimqClient from './rabbitmq/client'

const server = express()
server.use(express.json())

// eslint-disable-next-line @typescript-eslint/no-misused-promises
server.post('/operate', async (req, res) => {
  const response = await rabbimqClient.sendMessage(req.body as { operation: string })
  res.send({ response })
})

server.listen(3001, () => {
  console.log('Start listening Express.js on 3001')

  void rabbimqClient
    .initialize()
    .then(() => console.log('Start rabbitMQ client'))
    .catch()
})
