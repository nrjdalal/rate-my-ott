# Changelog

## v0.0.1

### 🚀 Enhancements

- **api:** Add the ratings lookup route with an omdb-backed cache ([cf12f91](https://github.com/nrjdalal/rate-my-ott/commit/cf12f91))
- **extension:** Add the wxt extension that shows ratings on netflix ([e42c3b1](https://github.com/nrjdalal/rate-my-ott/commit/e42c3b1))
- **api:** Retry a missed title without its qualifier or subtitle ([716d88f](https://github.com/nrjdalal/rate-my-ott/commit/716d88f))
- **api:** Resolve a title by year and runtime before trusting omdb's best match ([7b57214](https://github.com/nrjdalal/rate-my-ott/commit/7b57214))
- **extension:** Read each card's year, kind, and runtime, and show scores as one pill ([f0f09ff](https://github.com/nrjdalal/rate-my-ott/commit/f0f09ff))
- **ci:** Attach versioned extension zips to every release ([3c0c27e](https://github.com/nrjdalal/rate-my-ott/commit/3c0c27e))

### 🩹 Fixes

- **extension:** Read the current netflix card and modal markup ([1bf0be2](https://github.com/nrjdalal/rate-my-ott/commit/1bf0be2))

### 💅 Refactors

- Strip the saas surfaces the extension does not need ([d469403](https://github.com/nrjdalal/rate-my-ott/commit/d469403))

### 📖 Documentation

- Brand the site and describe the extension, the ratings api, and setup ([fefa885](https://github.com/nrjdalal/rate-my-ott/commit/fefa885))
- **readme:** Note the live urls and the branch-to-environment mapping ([2844593](https://github.com/nrjdalal/rate-my-ott/commit/2844593))

### 🎨 Styles

- **extension:** Hang the score label from the top edge, centered, like netflix's own labels ([adcc147](https://github.com/nrjdalal/rate-my-ott/commit/adcc147))

### ❤️ Contributors

- Neeraj Dalal @nrjdalal
