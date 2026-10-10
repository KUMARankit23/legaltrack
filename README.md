# LexFlow - Multi-Court Legal Case Management Platform

A comprehensive legal case management and tracking system supporting 29+ Indian court systems including High Courts, District Courts (via eCourts), and Tribunals.

## Features

- **Multi-Court Support**: Seamlessly manage cases across 21 High Courts, 7 Tribunals, and 743+ District Courts
- **Live Case Tracking**: Real-time hearing dates, order downloads, and case status updates
- **Automated Order Management**: PDF extraction and intelligent text parsing
- **Client Portal**: Invoice generation, billing integration, and case history
- **Hearing Reminders**: Automated email notifications for upcoming hearings
- **Full-Text Search**: Quick case lookup across all courts and parties

## Tech Stack

### Backend
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL with migrations
- **APIs**: RESTful with CORS support
- **Job Queue**: Node Cron for scheduled tasks
- **Email**: Nodemailer integration

### Frontend
- **Framework**: Next.js 14+ with React
- **Styling**: Tailwind CSS
- **State Management**: React hooks
- **TypeScript**: Full type safety
- **UI Components**: Shadcn/ui

## Supported Courts

### High Courts (21)
Allahabad, Bombay, Chennai, Chhattisgarh, Delhi, Gujarat, Guwahati, Himachal Pradesh, Jharkhand, Jammu & Kashmir, Kerala, Kolkata, Madras, Madhya Pradesh, Maharashtra, Orissa, Punjab, Rajasthan, Telangana, Uttarakhand, Bihar

### Tribunals (7)
- Central Administrative Tribunal (CAT)
- Debt Recovery Tribunal (DRT)
- Income Tax Appellate Tribunal (ITAT)
- National Company Law Tribunal (NCLT)
- National Company Law Appellate Tribunal (NCLAT)
- National Consumer Disputes Redressal Commission (NCDRC)
- National Green Tribunal (NGT)

### District Courts
743+ district courts via eCourts platform

## Quick Start

### Prerequisites
- Node.js 18+
- npm/yarn
- PostgreSQL 12+

### Installation

```bash
# Clone repository
git clone https://github.com/KUMARankit23/legaltrack.git
cd legaltrack

# Install dependencies
cd backend && npm install
cd ../frontend && npm install
cd ..
```

### Database Setup

```bash
cd backend

# Run migrations (creates tables, indexes, court registry)
npm run migrate

# Seed with court data (optional)
npm run seed
```

### Development

```bash
# Terminal 1: Backend API
cd backend
npm run dev
# Runs on http://localhost:4000

# Terminal 2: Frontend
cd frontend
npm run dev
# Runs on http://localhost:3000
```

### Production Build

```bash
# Backend
cd backend
npm run build
npm start

# Frontend
cd frontend
npm run build
npm start
```

## Configuration

### Environment Variables

**Backend** (`.env`):
```env
PORT=4000
DATABASE_URL=postgresql://user:password@localhost:5432/legaltrack
CORS_ORIGIN=http://localhost:3000
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
```

**Frontend** (`.env.local`):
```env
NEXT_PUBLIC_API_URL=http://localhost:4000
```

## API Endpoints

### Cases
- `POST /cases/lookup` - Search and fetch case details
- `GET /cases` - List all cases with filtering
- `POST /cases` - Manually add case
- `GET /cases/:id` - Get case details
- `PATCH /cases/:id` - Update case

### Clients
- `POST /clients` - Create client
- `GET /clients` - List clients
- `GET /clients/:id` - Get client details
- `PATCH /clients/:id` - Update client

### Search
- `GET /search?q=<query>` - Global full-text search

## Project Structure

```
legaltrack/
├── backend/
│   ├── src/
│   │   ├── adapters/           # Court adapters (all 29 courts)
│   │   │   ├── courts/         # High Court adapters
│   │   │   ├── tribunals/      # Tribunal adapters
│   │   │   └── ecourts/        # District courts
│   │   ├── api/                # Express routers
│   │   ├── db/                 # Database client & migrations
│   │   ├── ingestion/          # Case fetching & parsing
│   │   ├── notifications/      # Email service
│   │   ├── registry/           # Court registry
│   │   └── server.ts           # Main entry
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/
│   ├── app/
│   │   ├── page.tsx            # Cases dashboard
│   │   ├── clients/            # Client management
│   │   ├── billing/            # Billing & invoices
│   │   └── layout.tsx          # Root layout
│   ├── components/             # Reusable UI components
│   ├── package.json
│   └── tsconfig.json
│
├── .gitignore
├── package.json                # Workspace root
└── README.md
```

## Architecture

### Adapter Pattern
Each court is implemented as an adapter following `ICourtSourceAdapter` interface:
- `searchCase(query)` - Search for cases
- `getCaseDetails(caseNumber)` - Fetch case information
- `getHearingHistory(caseNumber)` - Get hearing dates
- `getOrders(caseNumber)` - Retrieve court orders

### Database Schema
- **Cases**: Case information, status, dates
- **Parties**: Litigants in each case
- **Hearings**: Full hearing history with dates
- **Orders**: Downloaded court orders with extracted text
- **Clients**: Law firm clients
- **Invoices**: Billing and invoice management

## Development Guide

### Adding a New Court Adapter

1. Create adapter file: `src/adapters/courts/courtNameAdapter.ts`
2. Implement `ICourtSourceAdapter` interface
3. Register in `adapterDispatcher.ts`
4. Test with adapter test suite

### Running Tests

```bash
cd backend
npm test

cd ../frontend
npm test
```

### Code Quality

```bash
# Linting
npm run lint

# Type checking
npm run type-check
```

## Performance Considerations

- **Rate Limiting**: 120 requests/hour per adapter
- **Session Management**: 30-minute sessions with auto-refresh
- **Caching**: In-memory cache for court registries
- **Pagination**: 50 cases per page (max 200)
- **Full-Text Search**: PostgreSQL GIN indexes on case content

## Security

- **Authentication**: OAuth 2.0 ready (TODO)
- **Authorization**: Role-based access control (TODO)
- **Data Encryption**: TLS in transit, sensitive data at rest
- **SQL Injection**: Parameterized queries throughout
- **CORS**: Configurable origin restrictions

## Roadmap

- [ ] OAuth 2.0 authentication
- [ ] Role-based access control (Admin/Lawyer/Clerk)
- [ ] Case timeline visualization
- [ ] AI-powered case summary generation
- [ ] Mobile app (React Native)
- [ ] Integration with Aadhaar for verification
- [ ] Automated form filing for common case types
- [ ] Advanced analytics dashboard

## Troubleshooting

### Database Connection Fails
- Verify PostgreSQL is running
- Check DATABASE_URL in `.env`
- Run migrations: `npm run migrate`

### Port Already in Use
```bash
# Find process on port 4000
netstat -ano | findstr :4000

# Kill process
taskkill /PID <PID> /F
```

### Adapter Not Fetching Data
- Check network connectivity to court websites
- Verify adapter credentials in `.env`
- Check browser console for CORS errors

## Contributing

1. Create feature branch: `git checkout -b feature/your-feature`
2. Commit changes: `git commit -am 'Add feature'`
3. Push to branch: `git push origin feature/your-feature`
4. Create Pull Request

## License

Proprietary - All rights reserved

## Support

For issues, feature requests, or questions:
- GitHub Issues: [Report a bug](https://github.com/KUMARankit23/legaltrack/issues)
- Email: support@legaltrack.dev

## About

**LexFlow** is built for legal professionals who need reliable, multi-court case management without the complexity. Developed with TypeScript for type safety and maintained for production use.

---

**Version**: 1.0.0  
**Last Updated**: October 2026  
**Status**: Production Ready
