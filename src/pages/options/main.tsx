import React from 'react';
import ReactDOM from 'react-dom/client';
// Import the main CSS file that includes Tailwind styles
import '~/index.css';
import Options from './Options'; // Import the Options component

// Find the root element in index.html and render the Options component into it
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Options />
  </React.StrictMode>
); 