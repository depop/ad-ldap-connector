var fs      = require('fs');
var http    = require('http');
var express = require('express');
var xtend   = require('xtend');
var request = require('request');
var urlJoin = require('url-join');
var test_ldap = require('./test_ldap');
var exec    = require('child_process').exec;
var app     = express();
var freeport = require('freeport');

app.configure(function () {
  this.set('views', __dirname + '/views');
  this.set('view engine', 'ejs');
  this.use(express.static(__dirname + '/public'));
  this.use(express.urlencoded());
  this.use(express.cookieParser());
  this.use(express.session({ secret: 'sojo sut ed oterces le' }));
});

function set_current_config (req, res, next) {
  var current_config = {};
  try {
    var content = fs.readFileSync(__dirname + '/../config.json', 'utf8');
    current_config = JSON.parse(content);
    if (!('AGENT_MODE' in current_config)) {
      current_config.AGENT_MODE = true;
    }
  }catch(err){}
  req.current_config = current_config;
  next();
}

function merge_config (req, res) {
  var new_config = xtend(req.current_config, req.body);
  fs.writeFileSync(__dirname + '/../config.json',
      JSON.stringify(new_config, null, 2));

  if(req.body.LDAP_URL) {
    return exec('net stop "Auth0 ADLDAP"', function () {
      exec('net start "Auth0 ADLDAP"', function () {
        setTimeout(function () {
          return res.redirect('/?s=1');
        }, 2000);
      });
    });
  }

  res.redirect('/');
}

app.get('/', set_current_config, function (req, res) {
  console.log(req.session.LDAP_RESULTS);
  res.render('index', xtend(req.current_config, {
    SUCCESS: req.query && req.query.s === '1',
    LDAP_RESULTS: req.session.LDAP_RESULTS
  }));
  delete req.session.LDAP_RESULTS;
});

app.post('/ldap', set_current_config, function (req, res, next) {
  test_ldap(req.body, function (err, result) {
    if (err) {
      return res.render('index', xtend(req.current_config, req.body, {
        ERROR: err.message,
        LDAP_RESULTS: result
      }));
    }
    req.session.LDAP_RESULTS = result;
    console.log(req.session.LDAP_RESULTS);
    next();
  });
}, function (req, res, next) {
  if (req.body.PORT || req.current_config.PORT) return next();
  freeport(function (er, port) {
    req.body.PORT = port;
    next();
  });
} , merge_config);

app.post('/ticket', set_current_config, function (req, res, next) {
  if (!req.body.PROVISIONING_TICKET) {
    return res.render('index', xtend(req.current_config, {
      ERROR: 'The ticket url ' + req.body.PROVISIONING_TICKET + ' is not vaild.'
    }));
  }

  request(urlJoin(req.body.PROVISIONING_TICKET, '/info'), function (err, resp, body) {
    var payload = {};
    try{
      payload = JSON.parse(body);
    } catch(ex){}
    if (err || resp.statusCode !== 200 || !payload.realm) {
      return res.render('index', xtend(req.current_config, {
        ERROR: 'The ticket url ' + req.body.PROVISIONING_TICKET + ' is not vaild.'
      }));
    }

    next();
  });
}, merge_config);

http.createServer(app).listen(8357, '127.0.0.1', function () {
  console.log('listening on http://localhost:8357');
});