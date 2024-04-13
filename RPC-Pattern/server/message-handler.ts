import type { ConsumeMessage } from 'amqplib'

export class MessageHandler {
  static processMessage(message: ConsumeMessage): { value: number } {
    const response = { value: 0 }

    const { content, properties } = message

    const { headers } = properties
    const { num1, num2 } = JSON.parse(content.toString()) as { num1: number; num2: number }

    const operation: string | undefined = headers?.operation

    const mathMap = {
      multiply: (a: number, b: number) => a * b,
      division: (a: number, b: number) => a / b,
    }

    response.value =
      operation && Object.hasOwn(mathMap, operation)
        ? mathMap[operation as keyof typeof mathMap](num1, num2)
        : -1

    return response
  }
}
