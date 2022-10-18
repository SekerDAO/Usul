Change line 8 of `maci-circuits/ts/index.js` from this:

```
const snarkjsPath = path.join(
    __dirname,
    '..',
    './node_modules/snarkjs/cli.js',
)
```

to this

```
const snarkjsPath = path.join(
    __dirname,
    '../..',
    './snarkjs/cli.js',
)
```

I modified the corresponding line in `maci-circuits/ts/build/index.js` to make my script work.

------

