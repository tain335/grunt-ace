/*
 * grunt-ace
 * https://github.com/tain335/tain335
 *
 * Copyright (c) 2014 tain335
 * Licensed under the MIT license.
 */

'use strict';

module.exports = function(grunt) {
  // Project configuration.
  grunt.initConfig({
    jshint: {
      all: [
        'Gruntfile.js'
      ],
      options: {
        jshintrc: '.jshintrc'
      }
    },
    // Before generating any new files, remove any previously-created files.
    clean: {
      tests: ['tmp'],
    },
    // Configuration to be run (and then tested).
    ace: {
      options: {
        encoding: 'utf-8',
        root: '<%=grunt.option("root") || process.cwd()%>',
        output: '<%=grunt.option("output") || "../webapp/static"%>'
      },
      'init-all': {

      },
      'compile-all': {
        options: {
          
        }
      },
      'build-all': {
        options: {
          requireCfg: 'lib/requireJS/config',
          ignores: [
            'lib/jquery/**',
            'lib/requireJS/**',
            'node_modules/**',
            'Gruntfile.js',
            'package.json'
          ]
        }
      },
      'copy-all': {
        options: {
          inserts: [
            'lib/requireJS/main',
            'lib/requireJS/config'
          ],
          reserves: [
            'lib/jquery/**',
            'lib/requireJS/**'
          ]
        }
      }
    }
  });

  // These plugins provide necessary tasks.
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-ace');

  // Whenever the "test" task is run, first clean the "tmp" dir, then run this
  // plugin's task(s), then test the result.
  grunt.registerTask('test', ['jshint', 'clean']);

  grunt.registerTask('build', ['ace:compile-all', 'ace:build-all', 'ace:copy-all']);

  grunt.registerTask('init', ['ace:init-all']);
  // By default, lint and run all tests.
  grunt.registerTask('default', ['build']);

};
