# Rio Flood Monitor - Redesigned Application

A modern, responsive, and accessible flood monitoring system for Rio de Janeiro, completely redesigned from the ground up with exceptional UX and performance.

## 🎨 Design Highlights

### Visual Design
- **Modern UI**: Clean, professional interface using Tailwind CSS
- **Dark Mode**: Full dark mode support with system preference detection
- **Responsive**: Seamless experience across all devices (mobile, tablet, desktop)
- **Accessible**: WCAG 2.1 AA compliant with full keyboard navigation

### Key Features
- **Real-time Dashboard**: Live statistics and critical alerts overview
- **Interactive Map**: ArcGIS-powered map with color-coded region markers
- **Smart Search**: Instant search with autocomplete and filtering
- **Region Cards**: Beautiful card-based layout with status indicators
- **Detail Modal**: Comprehensive region details with tabs for overview, alerts, and cameras
- **Live Camera Feeds**: Auto-refreshing camera streams with configurable intervals
- **Toast Notifications**: Non-intrusive notifications for important events

## 🏗️ Architecture

### Component-Based Structure
```
flood-monitor/
├── index.html              # Main entry point
├── js/
│   ├── app.js             # Main application controller
│   ├── auth.js            # Authentication module
│   ├── api.js             # API client with caching
│   ├── map.js             # Map management
│   ├── components/
│   │   ├── dashboard.js   # Dashboard statistics
│   │   ├── regionCard.js  # Region status cards
│   │   ├── alertPanel.js  # Critical alerts panel
│   │   └── modal.js       # Region detail modal
│   └── utils/
│       ├── dateTime.js    # Date/time utilities
│       ├── colors.js      # Color utilities
│       └── storage.js     # LocalStorage management
├── styles/
│   └── custom.css         # Custom styles (minimal)
└── assets/
    ├── icons/             # Application icons
    └── favicon.ico        # Favicon
```

### Technology Stack
- **HTML5**: Semantic markup
- **Tailwind CSS 3.x**: Utility-first styling
- **Vanilla JavaScript (ES6+)**: Modern, modular JavaScript
- **MapLibre GL JS 4.1**: Open-source vector maps with 60 FPS rendering
- **Chart.js**: Data visualization (ready for analytics)

## 🚀 Features

### Dashboard
- **Key Metrics**: Total regions, active alerts, AI detections, Waze reports
- **Real-time Updates**: Auto-refresh with configurable intervals
- **Status Overview**: Quick glance at system-wide status

### Interactive Map
- **Color-Coded Markers**: Visual status indicators with glow effects
- **Rich Tooltips**: Hover to see region info instantly
- **Click Interactions**: Click markers to view region details with ripple effects
- **Smooth Animations**: 60 FPS fluid map transitions with cinematic flyTo
- **Fullscreen Mode**: Expand map for detailed viewing
- **Geolocate**: Find your current location on the map
- **Vector Tiles**: Crisp rendering at any zoom level

### Region Management
- **Status Cards**: Beautiful cards showing region status and metrics
- **Filtering**: Filter by status (Critical, Alert, Caution, Normal)
- **Sorting**: Sort by status, name, alerts, or last update
- **Search**: Real-time search across regions

### Region Details
- **Tabbed Interface**: Overview, Alerts, and Cameras tabs
- **Status Display**: Large, clear status indicators
- **Alert Timeline**: Chronological list of all alerts
- **Camera Grid**: Live camera feeds with auto-refresh
- **Metrics**: Key statistics and measurements

### User Experience
- **Loading States**: Skeleton screens and spinners
- **Error Handling**: Graceful error messages and retry logic
- **Offline Support**: Cached data for offline viewing
- **Keyboard Navigation**: Full keyboard support
- **Screen Reader Support**: ARIA labels and semantic HTML

## 🔧 Configuration

### API Endpoints
The application connects to:
- **Main API**: `https://octa-api-871238133710.us-central1.run.app`
- **Auth API**: `https://mongo-api-871238133710.us-central1.run.app`
- **Camera API**: `https://dev.tixxi.rio/outvideo3/`

### User Preferences
Stored in localStorage:
- Theme (light/dark)
- Auto-refresh enabled/disabled
- Refresh interval (seconds)
- Notifications enabled/disabled

## 📱 Responsive Design

### Breakpoints
- **Mobile**: < 640px
- **Tablet**: 640px - 1024px
- **Desktop**: 1024px - 1536px
- **Large**: > 1536px

### Mobile Optimizations
- Collapsible navigation
- Touch-friendly controls (44x44px minimum)
- Optimized layouts for small screens
- Swipeable camera feeds

## ♿ Accessibility

### WCAG 2.1 AA Compliance
- ✅ Color contrast ratios (4.5:1 minimum)
- ✅ Keyboard navigation
- ✅ Screen reader support
- ✅ Focus indicators
- ✅ ARIA labels and landmarks
- ✅ Semantic HTML structure

### Keyboard Shortcuts
- `Tab`: Navigate between elements
- `Enter/Space`: Activate buttons
- `Escape`: Close modals
- `Arrow Keys`: Navigate camera pagination

## 🎯 Performance

### Optimizations
- **Lazy Loading**: Images and cameras load on demand
- **Caching**: API responses cached with expiration
- **Debouncing**: Search and scroll events debounced
- **Code Splitting**: Modular JavaScript for faster loads
- **Async Operations**: Non-blocking API calls

### Metrics (Target)
- First Contentful Paint: < 1.5s
- Time to Interactive: < 3s
- Lighthouse Score: > 90

## 🔐 Security

- JWT-based authentication
- Secure token storage
- XSS prevention (input sanitization)
- HTTPS-only connections
- Content Security Policy ready

## 🌐 Browser Support

- Chrome/Edge: Latest 2 versions
- Firefox: Latest 2 versions
- Safari: Latest 2 versions
- Mobile browsers: iOS Safari, Chrome Android

## 📦 Deployment

### Requirements
- Web server (Apache, Nginx, or similar)
- HTTPS enabled
- Modern browser support

### Setup
1. Upload all files to web server
2. Ensure proper MIME types for JavaScript modules
3. Configure HTTPS
4. Test authentication flow

### Environment Variables
No build process required. Configuration is in:
- `js/api.js` - API endpoints
- `js/auth.js` - Auth configuration

## 🐛 Debugging

### Browser Console
Access the application state:
```javascript
// View current state
window.floodMonitor.state

// Reload data
window.floodMonitor.loadData()

// Open region detail
window.floodMonitor.handleRegionClick(polygon)
```

### Common Issues
1. **Map not loading**: Check ArcGIS API key
2. **Auth errors**: Verify token in localStorage
3. **Camera feeds not updating**: Check camera API endpoint
4. **Data not loading**: Check API endpoints and CORS

## 📄 License

Copyright © 2024 OCTA.RIO. All rights reserved.

## 👥 Credits

- **Design & Development**: Complete redesign from scratch
- **Original Application**: OCTA.RIO Team
- **Mapping**: ArcGIS Maps SDK
- **Icons**: Font Awesome, Custom SVG
- **Fonts**: Inter (Google Fonts)

## 📞 Support

For issues or questions, contact the OCTA.RIO development team.

---

**Version**: 2.0.0  
**Last Updated**: November 2024  
**Status**: Production Ready

