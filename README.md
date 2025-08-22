# 🚀 Feature Requests Board

A modern, interactive feature request management system built with Next.js 14 and Supabase. Allow your users to submit, vote on, and track feature requests with a beautiful, responsive interface.

![Feature Requests Demo](https://via.placeholder.com/800x400/4f46e5/ffffff?text=Feature+Requests+Board+Demo)

## ✨ Features

- 🗳️ **User Voting System** - Users can upvote/downvote feature requests
- 🔍 **Smart Search & Filtering** - Filter by status, search by keywords
- 📊 **Sort Options** - Sort by trending, most votes, or newest
- 📱 **Responsive Design** - Works perfectly on all devices
- ⚡ **Real-time Updates** - Optimistic UI updates for smooth interactions
- 🎨 **Modern UI** - Clean, professional interface with Tailwind CSS
- 🔐 **Admin Panel** - Manage feature requests and update statuses
- 📄 **Pagination** - Infinite scroll for large datasets
- 🎯 **Status Tracking** - Track requests through their lifecycle

## 🛠️ Tech Stack

- **Framework:** [Next.js 15](https://nextjs.org/) (App Router + Turbopack)
- **Database:** [Supabase](https://supabase.com/) (PostgreSQL)
- **Styling:** [Tailwind CSS v4](https://tailwindcss.com/)
- **UI Components:** [Radix UI](https://www.radix-ui.com/) + Custom Components
- **TypeScript:** Full type safety with React 19
- **Icons:** [Lucide React](https://lucide.dev/)
- **Code Quality:** [Biome](https://biomejs.dev/) (ESLint + Prettier alternative)

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- A Supabase account and project

### 1. Clone the Repository

```bash
git clone https://github.com/badrkarrachai/feature-requests.git
cd feature-requests
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Setup

Create a `.env.local` file in the root directory:

```env
# Supabase Configuration
SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# App Configuration
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### 4. Database Setup

Execute the SQL schema in your Supabase SQL editor:

```sql
-- Located in src/lib/database/schema.sql
-- Creates features and votes tables with proper relationships
```

### 5. Run the Development Server

```bash
npm run dev
```

This will start the development server with **Turbopack** for faster builds and hot reload.

Open [http://localhost:3000](http://localhost:3000) to see the application.

## 📁 Project Structure

```
src/
├── app/                    # Next.js 14 App Router
│   ├── admin/             # Admin dashboard
│   ├── api/features/      # API routes for features
│   └── features/          # Main feature board
├── components/
│   ├── common/            # Shared components
│   ├── features/          # Feature-specific components
│   ├── layout/            # Layout components
│   └── ui/                # shadcn/ui components
├── hooks/                 # Custom React hooks
├── lib/
│   ├── database/          # Database schema
│   ├── providers/         # Supabase client
│   └── utils/             # Utility functions
└── types/                 # TypeScript definitions
```

## 🎯 Usage

### For Users

1. **View Features:** Browse all feature requests on the main board
2. **Search & Filter:** Use the search bar and filter dropdown to find specific requests
3. **Vote:** Click the vote button to upvote features you want
4. **Submit:** Click "Request Feature" to submit a new idea

### For Admins

1. **Access Admin Panel:** Navigate to `/admin`
2. **Update Status:** Change feature request statuses
3. **Manage Requests:** View detailed analytics and manage submissions

## 🔧 Configuration

### Environment Variables

| Variable                        | Description               | Required |
| ------------------------------- | ------------------------- | -------- |
| `SUPABASE_URL`                  | Your Supabase project URL | ✅       |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key    | ✅       |
| `SUPABASE_SERVICE_ROLE_KEY`     | Supabase service role key | ✅       |
| `NEXT_PUBLIC_SITE_URL`          | Your app's URL            | ✅       |

### Customization

#### Styling

- Modify `src/app/globals.css` for global styles
- Update Tailwind config in `tailwind.config.ts`
- Customize components in `src/components/ui/`

#### Database

- Schema located at `src/lib/database/schema.sql`
- Modify table structure as needed
- Update TypeScript types in `src/types/index.ts`

## 📊 API Reference

### Features Endpoints

```bash
GET    /api/features          # Get all features (with filters)
POST   /api/features          # Create new feature
GET    /api/features/[id]     # Get specific feature
PUT    /api/features/[id]     # Update feature (admin)
DELETE /api/features/[id]     # Delete feature (admin)
POST   /api/features/[id]/vote # Toggle vote on feature
```

### Query Parameters

```bash
# GET /api/features
?q=search_term        # Search features
&status=open          # Filter by status
&sort=trending        # Sort order
&limit=10            # Results per page
&page=1              # Page number
```

## 🚢 Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Connect your repo to [Vercel](https://vercel.com)
3. Add environment variables in Vercel dashboard
4. Deploy automatically

### Other Platforms

Works with any platform supporting Next.js:

- Netlify
- Railway
- DigitalOcean App Platform

## 🧪 Testing & Code Quality

```bash
# Check code quality with Biome
npm run lint

# Format code with Biome
npm run format

# Build with Turbopack
npm run build
```

## 📈 Performance

- ⚡ **Turbopack** - Ultra-fast bundler for development and builds
- 🔄 **Optimistic UI Updates** - Instant feedback for user actions
- 📄 **Infinite Scroll** - Smooth pagination for large datasets
- 📱 **Mobile Optimized** - Fast loading on all devices
- 🎯 **Efficient Queries** - Optimized database queries with indexes
- 🚀 **React 19** - Latest React features for better performance

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m '✨ feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 🐛 Bug Reports

Found a bug? Please open an issue with:

- Clear description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Screenshots (if applicable)

## 📝 Changelog

See [CHANGELOG.md](CHANGELOG.md) for details on releases and updates.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Radix UI](https://www.radix-ui.com/) for the excellent headless UI primitives
- [Supabase](https://supabase.com/) for the excellent backend service
- [Tailwind CSS](https://tailwindcss.com/) for the utility-first CSS framework
- [Lucide](https://lucide.dev/) for the clean, consistent icons
- [Biome](https://biomejs.dev/) for blazing fast linting and formatting

## 📞 Support

- 📧 Email: badrkarrachai@gmail.com
- 💬 Discussions: [GitHub Discussions](https://github.com/badrkarrachai/feature-requests/discussions)
- 🐦 LinkedIn: [@badrkarrachai](https://www.linkedin.com/in/badr-karrachai/)

---

<div align="center">
  <strong>Built with ❤️ using Next.js 15, React 19, and Supabase</strong>
  <br>
  <sub>⚡ Powered by Turbopack • 🎨 Styled with Tailwind v4 • 🔧 Quality assured by Biome</sub>
  <br><br>
  <sub>Give it a ⭐ if you found it helpful!</sub>
</div>
