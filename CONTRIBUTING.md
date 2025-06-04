# Contributing to BARS Site

Thank you for your interest in contributing to the BARS website! This guide will help you get started with contributing to the frontend React application.

## Getting Started

### Prerequisites

- Node.js 18 or higher
- Git
- A modern web browser for testing

> **⚠️ Important for Authentication Development**: If you're working on authentication features, user management, or any functionality that requires user login, you **MUST** also clone and run the BARS backend API locally. The frontend alone cannot handle authentication without the backend.

### Development Setup

> **🔧 Backend Requirement**: For authentication features, division management, airport contributions, or any user-related functionality, you need to run both the frontend and backend locally. Clone the BARS API repository and follow its setup instructions before proceeding with frontend development that involves authentication.

1. **Fork and Clone**

   ```bash
   git clone https://github.com/stopbars/Website.git
   cd Website
   ```

   **For authentication development, also clone the backend:**

   ```bash
   git clone https://github.com/stopbars/API.git
   cd API
   # Follow the backend setup instructions in the API repository
   cd ../Website
   ```

2. **Install Dependencies**

   ```bash
   npm install
   ```

3. **Configure Environment Variables**

   **Set up environment variables:**

   ```bash
   copy .env.example .env
   ```

   Edit `.env` and add your API credentials:

   - `VITE_VATSIM_CLIENT_ID`: Your VATSIM Connect application client ID
   - `VITE_MAPBOX_TOKEN`: Your Mapbox access token (optional for basic testing)

   **Configure VATSIM Connect:**

   To get VATSIM Connect credentials for testing:
   1. Follow the [VATSIM Connect Sandbox Guide](https://vatsim.dev/services/connect/sandbox) to create a development application
   2. Obtain your client ID and update the `VITE_VATSIM_CLIENT_ID` in your `.env` file
   3. Set your redirect URL to `http://localhost:5173/auth/callback` in your VATSIM Connect application settings

   > **Note**: The VATSIM client ID is required for authentication features to work properly during development.

   **Configure API URL for local development:**

   **⚠️ REQUIRED for authentication features**: Update the API URL in `src/context/AuthContext.jsx` to point to your local backend:

   ```javascript
   const apiUrl = 'http://localhost:8787'; // Update this to match your local backend port
   ```

   > **Critical**: Authentication, user management, division features, and airport contributions will NOT work without a running backend API. Make sure you have cloned and started the BARS API server before testing these features.

   > **Important**: Do not commit changes to the API URL. This should remain as a local modification for development purposes only.

4. **Start Development Server**

   ```bash
   npm run dev
   ```

   The development server will start at `http://localhost:5173` with hot module replacement enabled.

   > **💡 Developer Tip**: If you see the "Coming Soon" screen, type `barsv2` to reveal the developer toggle and exit maintenance mode.

5. **Available Scripts**

   - `npm run dev` - Start development server with hot reload
   - `npm run build` - Build for production
   - `npm run preview` - Preview production build locally
   - `npm run lint` - Run ESLint to check code quality

## Development Guidelines

### Code Style

- Use modern React patterns (hooks, functional components)
- Follow existing naming conventions and file structure
- Use TypeScript where applicable (`.tsx` and `.ts` files)
- Use [JSDoc comments](https://jsdoc.app/about-getting-started) for complex functions
- Keep components focused and reusable
- Use Tailwind CSS for styling

### Project Structure

- `src/components/` - Reusable React components organized by feature
- `src/pages/` - Page-level components that represent routes
- `src/hooks/` - Custom React hooks
- `src/context/` - React context providers
- `src/utils/` - Utility functions and helpers
- `src/styles/` - Global styles and CSS
- `public/` - Static assets and documentation

### Component Guidelines

- Use functional components with hooks
- Follow the existing component organization pattern
- Keep components small and focused
- Use proper PropTypes or TypeScript interfaces
- Implement proper error boundaries where needed

## Contribution Process

### 1. Find or Create an Issue

- Browse existing issues for bug fixes or feature requests
- Create a new issue for significant changes
- Discuss the approach before starting work

### 2. Create a Feature Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

### 3. Make Your Changes

- Write clean, well-documented code
- Test your changes thoroughly
- Update documentation if necessary

### 4. Commit Your Changes

```bash
git add .
git commit -m "Add brief description of your changes"
```

Use clear, descriptive commit messages:

- `feat: add new airport contribution form`
- `fix: resolve mobile navigation menu issue`
- `docs: update contribution documentation`
- `style: improve responsive design for tablets`

### 5. Push and Create Pull Request

```bash
git push origin feature/your-feature-name
```

Create a pull request with:

- Clear description of changes
- Reference to related issues
- Screenshots for UI changes
- Testing instructions for new features

## Testing

### Local Testing

1. Start the development server: `npm run dev`
2. Test the application in different browsers
3. Verify responsive design on various screen sizes
4. Test form submissions and user interactions
5. Check accessibility using browser dev tools

### Build Testing

1. Create a production build: `npm run build`
2. Preview the build locally: `npm run preview`
3. Verify all features work in production mode

### UI/UX Testing

- Test on mobile, tablet, and desktop screen sizes
- Verify all interactive elements work properly
- Check loading states and error handling
- Ensure accessibility standards are met

## Common Issues

### Build Errors

- Run `npm install` to ensure all dependencies are installed
- Clear cache with `rm -rf node_modules package-lock.json && npm install`
- Check for Node.js version compatibility (18+)

### Styling Issues

- Ensure Tailwind CSS classes are properly configured
- Check for conflicting CSS rules
- Verify responsive design breakpoints

### Component Errors

- Check for missing imports or exports
- Verify PropTypes or TypeScript interfaces
- Ensure proper React hook usage

## Getting Help

- **Discord**: [Join the BARS Discord server](https://discord.gg/7EhmtwKWzs) for real-time help
- **GitHub Issues**: [Create an issue](https://github.com/stopbars/Website/issues/new) for bugs or feature requests
- **Code Review**: Ask for review on complex changes

## Recognition

Contributors are recognized in:

- Release notes for significant contributions
- BARS website credits page (coming soon)

Thank you for helping make the BARS website better for the entire virtual aviation community!
