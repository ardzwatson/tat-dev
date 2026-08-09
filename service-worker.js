self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);
  const repoName = '/reponame'; // Replace with your actual repo name

  if (requestUrl.hostname.includes('github.io')) {
    let cleanPath = requestUrl.pathname;
    
    if (cleanPath.startsWith(repoName)) {
      cleanPath = cleanPath.substring(repoName.length);
    }

    if (!cleanPath.startsWith('/')) {
      cleanPath = '/' + cleanPath;
    }

    const destination = 'https://tat-app.b-cdn.net' + cleanPath + requestUrl.search + requestUrl.hash;
    event.respondWith(Response.redirect(destination, 302));
  }
});
