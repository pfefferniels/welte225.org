import { registerHooks } from 'node:module'

const candidates = specifier => [specifier, `${specifier}.js`, `${specifier}/index.js`]

registerHooks({
    resolve(specifier, context, nextResolve) {
        if (!specifier.startsWith('.') && !specifier.startsWith('/')) return nextResolve(specifier, context)
        const errors = []
        for (const candidate of candidates(specifier)) {
            try { return nextResolve(candidate, context) } catch (error) { errors.push(error) }
        }
        throw errors[0]
    }
})
