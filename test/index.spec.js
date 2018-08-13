const Hapi = require('hapi');
const hapiAuthBasic = require('hapi-auth-basic');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');
const hapiFieldAuth = require('../src/index');

chai.use(chaiAsPromised);
chai.use(sinonChai);

global.chai = chai;
global.sinon = sinon;
global.expect = chai.expect;
global.should = chai.should();

const validate = async (request, username) => {
  if (username === 'admin') {
    return {
      isValid: true,
      credentials: {
        username,
        scope: ['write', 'write.extended'],
        role: ['admin'],
      },
    };
  }
  if (username === 'writer') {
    return {
      isValid: true,
      credentials: {
        username,
        scope: ['write'],
        role: ['writer'],
      },
    };
  }
  return {
    isValid: false,
  };
};

const listener = {
  errors: (request, event, tags) => { // eslint-disable-line no-unused-vars
    // console.log('####', event);
  },
};

const setup = async () => {
  const server = new Hapi.Server({
    port: 9004,
    // debug: {
    //   request: ['error'],
    // },
  });
  const route1 = {
    method: 'GET',
    path: '/test',
    options: {
      auth: false,
    },
    handler: () => 'ok',
  };
  const route2 = {
    method: 'PATCH',
    path: '/test',
    options: {
      auth: {
        access: {
          scope: ['write', 'write.extended'],
        },
      },
      plugins: {
        'hapi-field-auth': [{
          fields: ['protected'],
          scope: ['write.extended'],
        }],
      },
    },
    handler: () => 'ok',
  };
  const route3 = {
    method: 'PATCH',
    path: '/test/role',
    options: {
      auth: {
        access: {
          scope: ['write', 'write.extended'],
        },
      },
      plugins: {
        'hapi-field-auth': [{
          fields: ['protected'],
          role: ['admin'],
        }],
      },
    },
    handler: () => 'ok',
  };
  await server.register([hapiAuthBasic, hapiFieldAuth]);
  server.auth.strategy('simple', 'basic', { validate });
  server.auth.default('simple');
  await server.route([route1, route2, route3]);
  await server.start();
  return server;
};

describe('hapi-field-auth / no options', async () => {
  let server;

  beforeEach(async () => {
    server = await setup();
    sinon.spy(listener, 'errors');
    server.events.on({ name: 'request', filter: { tags: ['error'] } }, listener.errors);
  });

  afterEach(async () => {
    listener.errors.restore();
    await server.stop();
  });

  it('should not affect unprotected routes', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/test',
    });
    expect(res.statusCode).to.be.equal(200);
  });

  it('should not affect protected routes', async () => {
    const res = await server.inject({
      method: 'PATCH',
      url: '/test',
    });
    expect(res.statusCode).to.be.equal(401);
  });

  it('should issue error if protected route is not authenticated', async () => {
    const res = await server.inject({
      method: 'PATCH',
      url: '/test',
    });
    expect(res.statusCode).to.be.equal(401);
    expect(listener.errors.calledOnce).to.be.equals(true);
    const { tags, data } = listener.errors.getCall(0).args[1]; // event
    expect(tags).to.be.deep.equal(['error']);
    expect(data).to.be.equal('plugin hapi-field-auth: not authenticated');
  });

  it('should allow fields if no special scope', async () => {
    const res = await server.inject({
      method: 'PATCH',
      url: '/test',
      headers: {
        authorization: 'Basic d3JpdGVyOnRlc3Q=', // writer:test
      },
      payload: {
        bla: true,
      },
    });
    expect(res.statusCode).to.be.equal(200);
  });

  it('should protect fields if special scope / scope not sufficient', async () => {
    const res = await server.inject({
      method: 'PATCH',
      url: '/test',
      headers: {
        authorization: 'Basic d3JpdGVyOnRlc3Q=', // writer:test
      },
      payload: {
        bla: true,
        protected: true,
      },
    });
    expect(res.statusCode).to.be.equal(403);
  });

  it('should protect fields if special scope / scope sufficient', async () => {
    const res = await server.inject({
      method: 'PATCH',
      url: '/test',
      headers: {
        authorization: 'Basic YWRtaW46dGVzdA==', // admin:test
      },
      payload: {
        bla: true,
        protected: true,
      },
    });
    expect(res.statusCode).to.be.equal(200);
  });

  it('should issue error if protected route has empty payload', async () => {
    const res = await server.inject({
      method: 'PATCH',
      url: '/test',
      headers: {
        authorization: 'Basic YWRtaW46dGVzdA==', // admin:test
      },
    });
    expect(res.statusCode).to.be.equal(200);
    expect(listener.errors.calledOnce).to.be.equals(true);
    const { tags, data } = listener.errors.getCall(0).args[1]; // event
    expect(tags).to.be.deep.equal(['error']);
    expect(data).to.be.equal('plugin hapi-field-auth: payload is empty');
  });

  it('should protect fields if special scope / scope not sufficient / role', async () => {
    const res = await server.inject({
      method: 'PATCH',
      url: '/test/role',
      headers: {
        authorization: 'Basic d3JpdGVyOnRlc3Q=', // writer:test
      },
      payload: {
        bla: true,
        protected: true,
      },
    });
    expect(res.statusCode).to.be.equal(403);
  });

  it('should protect fields if special scope / scope sufficient / role', async () => {
    const res = await server.inject({
      method: 'PATCH',
      url: '/test/role',
      headers: {
        authorization: 'Basic YWRtaW46dGVzdA==', // admin:test
      },
      payload: {
        bla: true,
        protected: true,
      },
    });
    expect(res.statusCode).to.be.equal(200);
  });
});