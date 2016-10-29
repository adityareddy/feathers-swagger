/*
 * feathers-swagger
 *
 * Copyright (c) 2014 Glavin Wiechert
 * Licensed under the MIT license.
 */

'use strict';
var urlJoin = require('url-join');

module.exports = function (config) {
    return function () {
        var app = this;
        var services = {};
        config = config || {};

        // Enable the swagger Plugin
        app.enable('feathers swagger');

        // Apply configuration
        var rootDoc = {};
        var basePath = config.basePath || '';
        var docsPath = config.docsPath || 'docs';
        var docExt = config.docExt || '';

        // Setup docs from config
        rootDoc.info = config.info || {};

        // by 2.0
        rootDoc.paths = config.paths || {};
        rootDoc.definitions = config.definitions || {};
        rootDoc.swagger = config.swagger || '2.0';
        rootDoc.schemes = ['http'];
        rootDoc.tags = [];
        rootDoc.basePath = basePath;
        rootDoc.consumes = ['application/json'];
        rootDoc.produces = ['application/json'];
        rootDoc.securityDefinitions = {
                token: {
                    type: "apiKey",
                    name: "Authentication",
                    in: "header"
                }
            };

        // Create API for Documentation
        app.get(docsPath, function (req, res) {
            res.json(rootDoc);
        });

        // Optional: Register this plugin as a Feathers provider
        app.providers.push(function (path, service) {
            services[path] = service;
            service.docs = service.docs || {};
            // Load documentation from service, if available.
            var doc = service.docs;

            // by 2.0
            var pathObj = rootDoc.paths || {},
                withIdKey = '/'+path+'/{resourceId}',
                withoutIdKey = '/'+path;

            if(typeof pathObj[withoutIdKey] === 'undefined'){ pathObj[withoutIdKey] = {}; }
            if(typeof pathObj[withIdKey] === 'undefined'){ pathObj[withIdKey] = {}; }

            if(typeof doc.definition !== 'undefined'){
                rootDoc.definitions[path] = doc.definition;
            }
            if(typeof doc.definitions !== 'undefined'){
                rootDoc.definitions = Object.assign(rootDoc.definitions,doc.definitions);
            }

            function Operation(method, service, defaults) {
                defaults = defaults || {};
                // Find is available
                var operation = service.docs[method] || {};
                operation.parameters = operation.parameters || defaults.parameters || [];
                operation.responses = operation.responses || defaults.responses || [];
                operation.description = operation.description || defaults.description || '';
                operation.summary = operation.summary || defaults.summary || '';
                operation.tags = operation.tags || defaults.tags || [];
                operation.consumes = operation.consumes || defaults.consumes || [];
                operation.produces = operation.produces || defaults.produces || [];
                operation.security = {token: [ ]};
                operation.securityDefinitions = operation.securityDefinitions || defaults.securityDefinitions || [];
                // Clean up
                delete service.docs[method]; // Remove `find` from `docs`
                return operation;
            }

            // FIND
            if (typeof service.find === 'function') {
                pathObj[withoutIdKey].get = new Operation('find', service, {
                    tags: [path],
                    description: 'Retrieves a list of all resources from the service.',
                    produces: rootDoc.produces,
                    consumes: rootDoc.consumes
                });
            }
            // GET
            if (typeof service.get === 'function') {
                pathObj[withIdKey].get = new Operation('get', service, {
                    tags: [path],
                    description: 'Retrieves a single resource with the given id from the service.',
                    parameters: [{
                        description: 'ID of '+path+' to return',
                        in: 'path',
                        required: true,
                        name: 'resourceId',
                        type: 'integer'
                    }],
                    responses: {
                        '200': {
                            description: 'successful operation',
                            schema: {
                                '$ref': '#/definitions/'+path
                            }
                        }
                    },
                    produces: rootDoc.produces,
                    consumes: rootDoc.consumes
                });
            }
            // CREATE
            if (typeof service.create === 'function') {
                pathObj[withoutIdKey].post = new Operation('create', service, {
                    tags: [path],
                    description: 'Creates a new resource with data.',
                    parameters: [{
                        in: 'body',
                        name: 'body',
                        required: true,
                        schema: {'$ref':'#/definitions/'+path}
                    }],
                    produces: rootDoc.produces,
                    consumes: rootDoc.consumes
                });
            }
            // UPDATE
            if (typeof service.update === 'function') {
                pathObj[withIdKey].put = new Operation('update', service, {
                    tags: [path],
                    description: 'Updates the resource identified by id using data.',
                    parameters: [{
                        description: 'ID of '+path+' to return',
                        in: 'path',
                        required: true,
                        name: 'resourceId',
                        type: 'integer'
                    },{
                        in: 'body',
                        name: 'body',
                        required: true,
                        schema: {'$ref':'#/definitions/'+path}
                    }],
                    produces: rootDoc.produces,
                    consumes: rootDoc.consumes
                });
            }
            // REMOVE
            if (typeof service.remove === 'function') {
                pathObj[withIdKey].delete = new Operation('remove', service, {
                    tags: [path],
                    description: 'Removes the resource with id.',
                    parameters: [{
                        description: 'ID of '+path+' to return',
                        in: 'path',
                        required: true,
                        name: 'resourceId',
                        type: 'integer'
                    }],
                    produces: rootDoc.produces,
                    consumes: rootDoc.consumes
                });
            }

            function Tag(name, options){
                options = options || {};
                var result = {};

                result.name = name;
                result.description = options.description || 'Operations about this resource.';
                result.externalDocs = options.externalDocs || {};

                return result;
            }

            rootDoc.paths = pathObj;
            rootDoc.tags.push(new Tag(path, doc));

            // Create handler for serving the service's documentation
            app.get(docsPath + '/' + path + docExt, function (req, res) {
                res.json(doc);
            });

        });

    };
};

module.exports.util = {
    Definition: function(model, type, properties){
        type = type ? type : 'object';
        properties = properties ? properties : {};
        var result = {
                type: type,
                properties: {}
            },
            keys = typeof model.attributes !== 'undefined' ? Object.keys(model.attributes) : [];

        for (var i = 0; i < keys.length; i++) {
            var attrName = keys[i],
                attrType = model.attributes[attrName].type.constructor.prototype.key,
                propertie = new module.exports.util.Propertie(attrType);
            result.properties[attrName] = propertie;
        }
        result.properties = Object.assign(result.properties, properties);

        return result;
    },
    Propertie: function(type, items){
        items = items ? items : {};
        var result = {
            type: module.exports.util.getType(type),
            format: module.exports.util.getFormat(type)
        };

        if(type === 'ARRAY'){
            result.items = items;
        }

        return result;
    },
    getType: function(type){
        switch(type){
            case 'STRING':
            case 'CHAR':
            case 'TEXT':
            case 'BLOB':
            case 'DATE':
            case 'DATEONLY':
            case 'TIME':
            case 'NOW':
                return 'string';
            case 'INTEGER':
            case 'BIGINT':
                return 'integer';
            case 'FLOAT':
            case 'DOUBLE':
            case 'DECIMAL':
                return 'number';
            case 'BOOLEAN':
                return 'boolean';
            case 'ARRAY':
                return 'array';
            default:
                return '';
        }
    },
    getFormat: function(type){
        switch(type){
            case 'INTEGER':
            case 'DECIMAL':
                return 'int32';
            case 'BIGINT':
                return 'int64';
            case 'FLOAT':
                return 'float';
            case 'DOUBLE':
                return 'double';
            case 'DATE':
            case 'DATEONLY':
                return 'date';
            case 'TIME':
            case 'NOW':
                return 'date-time';
            default:
                return '';
        }
    }
};
