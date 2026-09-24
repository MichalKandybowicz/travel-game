import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto'
import { promisify } from 'node:util'
import type { AccountRecord, Storage } from './storage.js'

const scrypt = promisify(scryptCallback)

export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex')

const hashPassword = async (
  password: string,
  salt: string,
): Promise<string> => {
  const key = (await scrypt(password, salt, 64)) as Buffer
  return key.toString('hex')
}

const issueToken = (): string => randomBytes(32).toString('hex')

export async function registerAccount(
  storage: Storage,
  username: string,
  password: string,
): Promise<{ account: AccountRecord; token: string }> {
  const salt = randomBytes(16).toString('hex')
  const token = issueToken()
  const account: AccountRecord = {
    id: randomUUID(),
    username: username.trim(),
    usernameKey: username.trim().toLowerCase(),
    passwordSalt: salt,
    passwordHash: await hashPassword(password, salt),
    authTokenHash: hashToken(token),
  }
  await storage.accounts.insertOne(account)
  return { account, token }
}

export async function loginAccount(
  storage: Storage,
  username: string,
  password: string,
): Promise<{ account: AccountRecord; token: string } | undefined> {
  const account = await storage.accounts.findOne({
    usernameKey: username.trim().toLowerCase(),
  })
  if (!account) {
    return undefined
  }
  const actual = Buffer.from(
    await hashPassword(password, account.passwordSalt),
    'hex',
  )
  const expected = Buffer.from(account.passwordHash, 'hex')
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return undefined
  }
  const token = issueToken()
  await storage.accounts.updateOne(
    { id: account.id },
    { $set: { authTokenHash: hashToken(token) } },
  )
  return { account, token }
}

export async function findAccountByToken(
  storage: Storage,
  token: string | undefined,
): Promise<AccountRecord | undefined> {
  if (!token) {
    return undefined
  }
  return (
    (await storage.accounts.findOne({ authTokenHash: hashToken(token) })) ??
    undefined
  )
}
