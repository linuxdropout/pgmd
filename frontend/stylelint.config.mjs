export default {
  extends: ['stylelint-config-standard-scss', 'stylelint-config-recess-order'],
  rules: {
    'declaration-no-important': true,
    'selector-class-pattern': '^[a-z][a-zA-Z0-9]*$',
  },
}
