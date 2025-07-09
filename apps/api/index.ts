import './config/config.js'
console.log('USER: ', process.env.DB_USER)
import cors from 'cors'
import express from 'express'
import bodyParser from 'body-parser'
import fileUpload from 'express-fileupload'
import apiRouter from './routes/index.js'
import { connectMongoDb } from './models/mongo.js'
import mongoose from 'mongoose'
import { TubeRagIngestionService } from './services/ingestion-service.js'
import { initializeCronService } from './services/cron-service.js'

const app = express()

app.use(cors({ origin: '*', credentials: true }))
app.use(fileUpload({ limits: { fileSize: 300 * 1024 * 1024 } })) // Adjust the size limit
app.use(bodyParser.json({ limit: '300mb' }))
app.use(bodyParser.urlencoded({ limit: '300mb', extended: true }))

app.use('/api', apiRouter)

app.use((err: any, req: any, res: any, next: any) => {
    if (err.name === 'UnauthorizedError') {
        res.status(401)
        res.json({ status: 'ERROR', message: 'Unauthorized user' })
    } else if (err.type === 'entity.too.large') {
        res.status(413)
        res.json({ status: 'ERROR', message: 'Payload is too large' })
    }
})

const port = process.env.PORT || 3000

// Initialize tube-rag services
async function initializeTubeRagServices() {
    try {
        console.log('Initializing tube-rag services...')
        
        // Initialize ingestion service
        const ingestionConfig = {
            youtube: {
                apiKey: process.env.YOUTUBE_API_KEY!,
                maxVideosPerPlaylist: 100
            },
            openai: {
                apiKey: process.env.OPENAI_API_KEY!,
                model: 'gpt-4-turbo-preview',
                embeddingModel: 'text-embedding-3-small'
            },
            mongodb: {
                uri: process.env.MONGODB_URI!,
                database: process.env.MONGODB_DATABASE!,
                collection: 'embeddings'
            }
        }
        
        const ingestionService = new TubeRagIngestionService(ingestionConfig)
        
        // Initialize cron service with ingestion service
        if (process.env.NODE_ENV !== 'test') {
            initializeCronService(ingestionService)
            console.log('Cron service initialized')
        }
        
        console.log('Tube-rag services initialized successfully')
        
    } catch (error) {
        console.error('Failed to initialize tube-rag services:', error)
        throw error
    }
}

connectMongoDb().then(async () => {
    try {
        // Initialize tube-rag services after MongoDB connection
        await initializeTubeRagServices()
        
        app.listen(port, () => {
            console.log(`HTTP Server running on port ${port}`)
            console.log('Available endpoints:')
            console.log('  Ingestion:')
            console.log('    POST /api/ingest/video - Ingest a single video')
            console.log('    POST /api/ingest/playlist - Ingest a playlist')
            console.log('    POST /api/ingest/blog - Ingest a blog')
            console.log('  Sources:')
            console.log('    POST /api/sources/playlist - Add playlist source')
            console.log('    POST /api/sources/blog - Add blog source')
            console.log('    GET /api/sources - Get all sources')
            console.log('  Jobs:')
            console.log('    GET /api/jobs/status/:jobId - Get job status')
            console.log('    GET /api/jobs/recent - Get recent jobs')
            console.log('  Search:')
            console.log('    POST /api/search - Semantic search')
            console.log('    POST /api/search/rag - RAG search')
            console.log('    GET /api/search/suggestions - Get search suggestions')
            console.log('  Videos:')
            console.log('    GET /api/videos/:videoId/transcript - Get video transcript')
            console.log('    GET /api/videos/:videoId/similar - Get similar videos')
            console.log('    GET /api/videos/channel/:channelId - Get videos by channel')
            console.log('    GET /api/videos/playlist/:playlistId - Get videos by playlist')
            console.log('  Health:')
            console.log('    GET /api/health - Health check')
            console.log('  Admin:')
            console.log('    POST /api/admin/cron/trigger/playlist - Trigger playlist check')
            console.log('    POST /api/admin/cron/trigger/blog - Trigger blog check')
            console.log('    GET /api/admin/cron/status - Get cron status')
        })

        // Graceful shutdown and error handling
        process.on('SIGINT', async () => {
            console.log('Received SIGINT, shutting down gracefully...')
            await mongoose.connection.close()
            console.log('MongoDB connection closed')
            process.exit(0)
        })

        process.on('uncaughtException', async (error) => {
            console.error('Uncaught Exception: ', error)
            await mongoose.connection.close()
            process.exit(1) // Exit with a failure code
        })

        process.on('unhandledRejection', async (reason, promise) => {
            console.error('Unhandled Rejection at:', promise, 'reason:', reason)
            await mongoose.connection.close()
            process.exit(1)
        })

    } catch (error) {
        console.error('Failed to initialize services:', error)
        process.exit(1)
    }
}).catch((err: any) => {
    console.error('Failed to connect to MongoDB', err)
    process.exit(1)
})


export default app


