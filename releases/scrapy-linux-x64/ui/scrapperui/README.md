# BertUI Template ⚡

**Bun + Elysia + React + Template + User Interface**

This is the official BertUI starter template. Everything you need to build fast React apps.

---

## 🚀 What is BertUI?

**B**un - Fastest JavaScript runtime  
**E**lysia - Lightning web framework  
**R**eact - The UI library (98% of BertUI!)  
**T**emplate - This starter  
**UI** - User Interface components  

BertUI is a React framework built for speed. If you know React, you already know BertUI.

**New to React?** Learn it first: [react.dev/learn](https://react.dev/learn)

---

## ⚡ Quick Start

```bash
bunx create-bertui my-app
cd my-app
bun run dev
```

Open `http://localhost:3000` and you're ready!

---

## 📁 Template Structure

```
my-app/
├── src/
│   ├── pages/
│   │   ├── index.jsx          # Home page (/)
│   │   ├── about.jsx          # About (/about)
│   │   └── blog/
│   │       ├── index.jsx      # Blog list (/blog)
│   │       └── [slug].jsx     # Blog post (/blog/:slug)
│   ├── styles/
│   │   ├── global.css         # Global styles
│   │   ├── home.css
│   │   ├── about.css
│   │   └── blog.css
│   ├── images/                # Your images
│   └── main.jsx
├── public/
│   └── favicon.svg
└── package.json
```

---

## 🎯 Key Features

### File-Based Routing
Create `src/pages/contact.jsx` → automatically get `/contact` route

### Dynamic Routes
Create `src/pages/user/[id].jsx` → matches `/user/123`, `/user/abc`, etc.

```jsx
export default function User({ params }) {
  return <h1>User: {params.id}</h1>;
}
```

### Server Islands (NEW in v1.1.0!)
Add one line for perfect SEO:

```jsx
export const render = "server";

export const meta = {
  title: "My Page",
  description: "SEO description"
};

export default function MyPage() {
  return <h1>Pre-rendered HTML!</h1>;
}
```

Learn more: [bertui-docswebsite.vercel.app/server-islands](https://bertui-docswebsite.vercel.app/server-islands)

---

## 🎨 Styling

This template uses CSS files. Simple and fast.

### Global Styles
Edit `src/styles/global.css` for site-wide styles.

### Page Styles
Each page has its own CSS:
- `home.css` for home page
- `about.css` for about page
- `blog.css` for blog

### Add Your Own
```jsx
import '../styles/my-page.css';
```

---

## 🖼️ Images

**Two locations only:**

1. `src/images/` - Component images
```jsx
import Logo from '../images/logo.png';
<img src={Logo} alt="Logo" />
```

2. `public/` - Static assets
```jsx
<img src="/favicon.svg" alt="Icon" />
```

**Don't use other folders!** They break builds.

---

## 🏗️ Build & Deploy

### Production Build
```bash
bun run build
```

Creates optimized `dist/` folder.

### Deploy to Vercel
```bash
vercel
```

Or push to GitHub and import to Vercel. Auto-detects BertUI!

---

## 🎓 Learning Resources

- **BertUI Docs:** [bertui-docswebsite.vercel.app](https://bertui-docswebsite.vercel.app/)
- **Server Islands:** [bertui-docswebsite.vercel.app/server-islands](https://bertui-docswebsite.vercel.app/server-islands)
- **React Docs:** [react.dev/learn](https://react.dev/learn)

---

## 💬 Community & Support

- **GitHub:** [github.com/BunElysiaReact/BERTUI](https://github.com/BunElysiaReact/BERTUI)
- **Discord:** [discord.gg/kvbXfkJG](https://discord.gg/kvbXfkJG)
- **Issues:** [github.com/BunElysiaReact/BERTUI/issues](https://github.com/BunElysiaReact/BERTUI/issues)

**Please leave an honest review!** This library is my passion project. If you like it, star the repo and recommend it to others.

---

## 🚧 Coming Soon

**Plugins are in development!** 

We're building:
- Icons plugin (best in the world!)
- More tooling
- Cool integrations

Stay tuned. We're building something amazing.

---

## 📊 Why BertUI?

**494ms** dev server startup  
**265ms** production builds  
**100KB** bundle size  
**30ms** HMR updates  

Not just claims - proven benchmarks: [See PERFORMANCE.md](https://github.com/BunElysiaReact/BERTUI/blob/main/PERFORMANCE.md)

---

## 📝 Template Tips

### Remove What You Don't Need
Don't need the blog? Delete `src/pages/blog/` and done.

### Use Link for Navigation
```jsx
import { Link } from 'bertui/router';
<Link to="/about">About</Link>  // ✅ Fast client-side
<a href="/about">About</a>       // ❌ Full page reload
```

### Keep It Simple
This template is intentionally simple. Add complexity only when you need it.

---

## ⚡ Performance

BertUI is **fast** by default:
- Bun runtime speed
- Automatic code splitting
- Optimized builds
- Minimal bundle size

You write code. We handle speed.

---

## 📄 License

MIT License - Use it however you want!

---

## 🙏 Credits

**Created by Pease Ernest**

This is my own library. I invested real time building it. If BertUI helps you, please:
- ⭐ Star the repo
- 📝 Leave a review
- 🗣️ Tell others about it

We're unpopular now, but with your help, we can grow!

---

## 🎯 Remember

**BertUI is 98% React.** If you know React, you know BertUI.

**New to React?** Learn at [react.dev/learn](https://react.dev/learn) first.

**Ready to build?** Start coding in `src/pages/` and watch the magic happen!

---

**Built with ⚡ and passion**