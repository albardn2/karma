# Manufacturing CRM System

## Overview
This project is a full-stack manufacturing Customer Relationship Management (CRM) system designed to manage customers, orders, materials, invoices, and payments. It aims to streamline operations with a modern, monorepo architecture, providing a comprehensive solution for manufacturing businesses. The system's key capabilities include robust customer and vendor management, detailed inventory and material tracking, integrated financial accounts, and advanced geographical service area definition. The business vision is to offer a scalable and efficient platform that enhances productivity and decision-making for manufacturing enterprises, with market potential in small to medium-sized manufacturers looking for an integrated management solution.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend utilizes React 18 with TypeScript, focusing on a responsive layout adaptable for desktop and mobile. UI components are built with Radix UI primitives and shadcn/ui for accessibility and modern aesthetics, styled using Tailwind CSS for a utility-first approach and custom theming. Visual consistency is maintained across all entity management pages (customers, vendors, warehouses, etc.), employing patterns like list/map view toggles, tab-based navigation, and professional table layouts inspired by services like Stripe. Maps generally default to Damascus, Syria, as the central coordinate for geographical displays. Empty states are designed with attractive messaging and clear calls-to-action.

### Technical Implementations
**Frontend:**
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter
- **State Management**: TanStack Query (React Query)
- **UI Toolkit**: Radix UI, shadcn/ui
- **Styling**: Tailwind CSS, custom CSS variables
- **Build Tool**: Vite
- **Mapping**: OpenStreetMap with Leaflet (and Leaflet Draw for polygon editing) for geographical features like customer locations, vendor service areas, and warehouse maps. Aggressive position preservation and event handling ensure map stability.
- **Form Handling**: Utilizes consistent patterns for CRUD operations, including dynamic dropdowns, UUID-based filtering, and robust validation with support for null values in optional fields.

**Backend:**
- **Framework**: Express.js with TypeScript
- **Runtime**: Node.js 20
- **Database ORM**: Drizzle ORM
- **Database**: PostgreSQL 16 (via Neon serverless for production)
- **Development Tools**: `tsx` for TypeScript execution, `esbuild` for production bundling.
- **API Design**: RESTful endpoints with Zod for input validation, centralized error handling, and request/response logging. Mock authentication endpoints are provided for development.

### Feature Specifications
- **Core Entities**: Manages Users, Customers, Materials, Customer Orders, Invoices, Payments, Vendors, Warehouses, Employees, Pricing, Fixed Assets, Inventory, Inventory Events, Service Areas, Purchase Orders, Payouts, Expenses, Transactions, Credit Note Items, Debit Note Items, and Trips.
- **Authentication & Authorization**: Basic user management with permission scopes and PostgreSQL session storage.
- **Financial Management**: Includes comprehensive tracking for invoices, payments, payouts, expenses, and financial accounts, with dynamic currency fetching and precise formatting (e.g., SYP for Syrian Pound).
- **Inventory & Order Management**: Detailed material tracking, inventory adjustments, purchase order creation with multi-item support, and customer order processing.
- **Workflow & Task Management**: 
  - Complete workflow orchestration with task dependency management
  - Horizontal progress bar visualization showing task execution flow in a simple, linear stepper design
  - Topological sort-based ordering using Kahn's algorithm to arrange tasks left-to-right based on depends_on field (list of task names)
  - Circular nodes representing each task with status-colored icons (checkmark for completed, clock for in-progress, X for failed)
  - Connecting lines between tasks showing execution flow, colored by task status
  - All task executions guaranteed to display even with missing dependencies or cycles
  - Task execution data loaded from workflow execution endpoint's task_executions field
  - Task completion with result field populated from form inputs as label:value JSON pairs
  - Form pre-population: previously completed tasks automatically load their result values into the form for review or editing
  - Auto-advance to next task: After completing a task execution, the system automatically loads the next pending task (not_started or in_progress) in the form, creating a smooth sequential workflow experience
  - TaskInputFieldBuilder supporting 11 field types (text, number, email, password, date, time, select, checklist, radio, file_upload, button)
  - External operator integration from `/task-execution/workflow-operators` endpoint
  - Task payload structure using snake_case (depends_on, callback_fns, task_inputs) matching Python backend DTOs
  - Complete API endpoint: POST `/task-execution/complete` with uuid and result in body
  - **Trip Operator Map Integration**: Interactive route visualization for trip_operator and trip_create_operator tasks
    - Automatically displays when trip_route_calculation task execution contains waypoint/route data
    - Shows numbered markers for each waypoint in sequential order
    - Renders polyline connecting waypoints to visualize the full route (uses route_coordinates if available, otherwise connects waypoints)
    - Uses FitBounds to auto-zoom map to show all waypoints optimally
    - **Route Visualization Modes**:
      - Full Route: Displays the complete route with all waypoints and the entire polyline
      - Animated Route: Interactive mode with slider to show progressive route from stop 0 to N, revealing waypoints and route segments dynamically
    - Robust data extraction handles diverse payload structures: direct arrays, nested objects, stringified JSON at any depth
    - Coordinate array detection identifies arrays of numeric tuples (e.g., [[lat, lon], ...]) regardless of nesting level
    - Searches recursively through all object properties (data, result, payload, output, route, stops, etc.) to find coordinate data
  - **Trip Stop Customer Map**: Customer location visualization for trip_stop operator tasks
    - Displays customer location on a map with a red pin marker
    - Automatically extracts coordinates from task_inputs.data.customer.coordinates
    - Shows customer name in popup (if available)
    - Auto-centers map on customer location
    - Displayed above task input form fields
- **Geographical Features**: Interactive maps for customers, vendors, warehouses, and service areas, including polygon drawing/editing for service area definition and map-based filtering.
- **Trip Management**: Comprehensive trip tracking and management system
  - Grid-based view with pagination and status filtering (planned, in_progress, completed, cancelled)
  - Trip cards displaying vehicle assignment, start/end times, notes, and workflow execution linkage
  - Integration with vehicles, warehouses, service areas, and workflow executions
  - Support for distribution areas (polygons), start/end points, and trip data (input inventory and output tracking)
  - Status-based badge visualization and delete functionality
  - Backend API endpoints: POST /trip/ (create), GET /trip/:uuid (read), PUT /trip/:uuid (update), GET /trip/ (list with filters)
- **Data Flow**: Client requests via TanStack Query to Express.js APIs, which interact with PostgreSQL via Drizzle ORM. Responses update the React Query cache and trigger UI re-renders.

### System Design Choices
The project adopts a monorepo structure. All API calls utilize a centralized `apiRequest` helper for consistency and error handling. Environment-based configuration manages API URLs for development and production. The system is designed for autoscale deployment, with specific configurations for Replit environments. Error handling is robust, covering both frontend and backend operations.

## External Dependencies

- **@neondatabase/serverless**: For serverless PostgreSQL connections.
- **drizzle-orm**: Type-safe SQL query builder for database interactions.
- **@tanstack/react-query**: For server state management and data fetching in the frontend.
- **@radix-ui/***: Accessible UI primitives used for building the component library.
- **shadcn/ui**: Components built on Radix UI and Tailwind CSS.
- **wouter**: Lightweight client-side router for React.
- **react-leaflet**, **leaflet**, **leaflet-draw**: For interactive maps and geographical feature editing.
- **Tailwind CSS**: Utility-first CSS framework for styling.
- **Vite**: Frontend build tool and development server.
- **TypeScript**: For static type checking across the entire codebase.
- **esbuild**: Fast JavaScript bundler for production backend builds.
- **Zod**: Schema declaration and validation library for input validation.
- **connect-pg-simple**: PostgreSQL session storage for Express.js.
- **cors**: Middleware for enabling Cross-Origin Resource Sharing in Express.js.
- **@replit/vite-plugin-runtime-error-modal**: Development error overlay for Replit.
- **@replit/vite-plugin-cartographer**: Code mapping plugin for Replit.
```