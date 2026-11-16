🛍️ SoleWeb
Discover local businesses, products & services, all in one place.
SoleWeb is a global local-business discovery platform with storefronts, full-text and spatial search, inventory management, and real-time notifications. Browse verified local storefronts, watch reels, explore products, and get live map directions.
🔗 Live App: https://soleweb.ai.studio
---
✨ Features
🏪 Storefronts: Businesses get a visual profile showcasing their products and services
🎞️ Reels: Short-form videos from local businesses
🔎 Full-text search: Find businesses, products and services by keyword
📍 Spatial (location-based) search: Discover what's near you
🗺️ Live map directions: Navigate straight to a storefront
📦 Inventory management: Sellers can manage products and stock
🔔 Real-time notifications: Stay updated on offers, stock and activity
✅ Verified businesses: Trustworthy local listings
📱 Progressive Web App (PWA): Installable on mobile and desktop
🌗 Light & dark mode support
---
📸 Screenshots
> 
Home <img width="1876" height="886" alt="image" src="https://github.com/user-attachments/assets/e1511804-2e6c-4f21-82e4-9791bbf8f243" />
	Storefront	<img width="1873" height="758" alt="image" src="https://github.com/user-attachments/assets/6619d4c8-d795-4d13-a4c5-d1a575fe584c" />
 Map <img width="1867" height="886" alt="image" src="https://github.com/user-attachments/assets/a380e4ef-bc10-42f2-a629-85e77e5ae946" />

		
---
🧰 Tech Stack
> Update this section to match your project.
Frontend: React / TypeScript / Tailwind CSS
Backend: Node.js
Database: PostgreSQL / Firebase (with spatial search support)
Maps: Google Maps API
Hosting: Google Cloud Run (asia-southeast1)
Built with: Google AI Studio
---
🚀 Getting Started
Prerequisites
Node.js v18 or later
npm or yarn
API keys (see Environment Variables)
Installation
```bash 
# Install dependencies
npm install

# Start the development server
npm run dev
```

Build for production
```bash
npm run build
npm run preview
```
------
📁 Project Structure
```
soleweb/
├── public/            # Static assets, PWA icons, manifest
├── src/
│   ├── components/    # Reusable UI components
│   ├── pages/         # App screens (Home, Storefront, Search, Map)
│   ├── services/      # API and data-access logic
│   ├── hooks/         # Custom hooks
│   └── utils/         # Helpers
├── .env.example
├── package.json
└── README.md
```
---
☁️ Deployment
SoleWeb is deployed on Google Cloud Run. To deploy your own instance:
```bash
gcloud run deploy soleweb \
  --source . \
  --region asia-southeast1 \
  --allow-unauthenticated
```
---
🤝 Contributing
Contributions are welcome!
Fork the repository
Create a feature branch: `git checkout -b feature/amazing-feature`
Commit your changes: `git commit -m "Add amazing feature"`
Push to the branch: `git push origin feature/amazing-feature`
Open a Pull Request
---
🗺️ Roadmap
[ ] Business reviews and ratings
[ ] In-app chat between customers and sellers
[ ] Online ordering and payments
[ ] Multi-language support
[ ] Analytics dashboard for sellers
---
📄 License
This project is licensed under the MIT License.
---
📬 Contact
Your Name · zishanansari00000123@gmail.com 

---
⭐ If you like SoleWeb, give it a star on GitHub!
