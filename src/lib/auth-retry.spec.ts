import { afterEach, expect, it, vi } from 'vitest'
import { retryFutureJwtRead } from './auth-retry'
afterEach(() => vi.useRealTimers())
it('recovers a transient future-issued JWT using delayed reads', async () => {
  vi.useFakeTimers()
  const read = vi
    .fn<() => Promise<string>>()
    .mockRejectedValueOnce({ code: 'PGRST303', message: 'JWT issued at future' })
    .mockRejectedValueOnce(new Error('JWT issued at future'))
    .mockResolvedValue('loaded')
  const result = retryFutureJwtRead(read)
  await vi.advanceTimersByTimeAsync(499)
  expect(read).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1)
  expect(read).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(1000)
  expect(await result).toBe('loaded')
  expect(read).toHaveBeenCalledTimes(3)
})
it('stops after four retries and preserves the original cause', async () => {
  vi.useFakeTimers()
  const error = new Error('JWT issued at future')
  const read = vi.fn<() => Promise<never>>().mockRejectedValue(error)
  const result = retryFutureJwtRead(read).catch((error) => error)
  await vi.runAllTimersAsync()
  expect(await result).toMatchObject({
    message: expect.stringContaining('horário da sessão'),
    cause: error,
  })
  expect(read).toHaveBeenCalledTimes(5)
})
it.each(['JWT expired', 'Invalid login credentials', 'permission denied', 'Network error'])(
  'does not retry other failures: %s',
  async (message) => {
    const error = new Error(message)
    const read = vi.fn<() => Promise<never>>().mockRejectedValue(error)
    await expect(retryFutureJwtRead(read)).rejects.toBe(error)
    expect(read).toHaveBeenCalledOnce()
  },
)
