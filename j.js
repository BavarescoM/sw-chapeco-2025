let fs = require('fs');
let a  = require(`./saida.json`)
let res = a.filter((e)=> {return e.quartos !== null})
fs.writeFileSync('santa.json', JSON.stringify(res, null, 2));   