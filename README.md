_________check   

    node -v
    npm -v
    // code đang su dung node 12.18.3 npm  6.14.6  chokidar@3.3.1
    // update node => npm install chokidar@4.0.3   & edit : const fs = require('node:fs');
_________________________________________________________________________________________

_________start

    npm init // enter tới kết thúc.
    npm install
    node app.js
    Ctrl +c // end
_______________________________________________________________________
_________auto

    pm2 start app.js
    pm2 list
    pm2 logs
    pm2 stop name.js  || pm2 stop id
    pm2 delete name.js || pm2 deleta id
__________________________________________________________________________________

    git config --global user.email "you@example.com" 
    git config --global user.name "Your Name"
    git config --global --list
    git add .
    git status
    git commit -m 'creat'
    git push origin main



