import fetch from 'node-fetch';

fetch('http://localhost:3000/trigger-server-restart', {
    method: 'POST'
}).then(res => res.text())
    .then(text => console.log(text))
    .catch(err => console.error('Error:', err));