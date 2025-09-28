# Worst-Case Scenario Polished — Docker + Tailwind

## Deployment

### Render (recommended)
1. Connect your GitHub repository to Render
2. Create a new Web Service
3. Use these settings:
   - Build Command: `npm run build`
   - Start Command: `npm start`
   - Environment: Docker

### Local Docker
1. docker-compose up --build
2. Access the game at http://localhost:4000
3. Stop: docker-compose down

## Manual Dev
### Server
cd server
npm install
npm run dev

### Client
cd client
npm install
npm start

## Multiplayer
- Multiple tabs/devices allowed.
- Each player gets random avatar.
- Chat, scoring, basic game flow.
- Tailwind UI already applied.
