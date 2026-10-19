export function isFutureJwtError(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('message' in error)) return false
  return typeof error.message === 'string' && /JWT issued (?:at|in the) future/i.test(error.message)
}

// A freshly issued token can briefly be ahead of the data service's clock.
// Retry reads only: never renew the JWT or repeat a write as a workaround.
export async function retryFutureJwtRead<T>(read: () => Promise<T>): Promise<T> {
  const delays = [500, 1000, 2000, 4000]
  for (let attempt = 0; ; attempt++) {
    try {
      return await read()
    } catch (error) {
      if (!isFutureJwtError(error)) throw error
      const delay = delays[attempt]
      if (delay === undefined)
        throw new Error(
          'O servidor ainda não conseguiu validar o horário da sessão. Aguarde alguns instantes e tente carregar novamente.',
          { cause: error },
        )
      await new Promise<void>((resolve) => setTimeout(resolve, delay))
    }
  }
}
