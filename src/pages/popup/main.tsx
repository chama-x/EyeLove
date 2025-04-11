import React from 'react';
import ReactDOM from 'react-dom/client';
// Import the main CSS file that includes Tailwind styles
// Adjust path if your main CSS entry point is different than src/index.css
import '~/index.css';
import Popup from './Popup'; // Import the Popup component we created earlier

// Find the root element in index.html and render the Popup component into it
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Popup />
  </React.StrictMode>
);