import * as dotenv from 'dotenv'
import path from 'path'
import { validateWorkerEnvironment } from '../src/lib/env'
import { startWorkerRuntime } from './runtime'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
validateWorkerEnvironment()

void startWorkerRuntime()
