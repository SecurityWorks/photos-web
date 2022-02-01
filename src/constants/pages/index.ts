export enum PAGES {
    CHANGE_EMAIL = '/change-email',
    CHANGE_PASSWORD = '/change-password',
    CREDENTIALS = '/credentials',
    GALLERY = '/gallery',
    GENERATE = '/generate',
    LOGIN = '/login',
    RECOVER = '/recover',
    SIGNUP = '/signup',
    TWO_FACTOR_SETUP = '/two-factor/setup',
    TWO_FACTOR_VERIFY = '/two-factor/verify',
    TWO_FACTOR_RECOVER = '/two-factor/recover',
    VERIFY = '/verify',
    ROOT = '/',
    SHARED_ALBUMS = '/shared-albums',
    ML_DEBUG = '/ml-debug',
}
export const getAlbumSiteHost = () =>
    process.env.NODE_ENV === 'production' ? 'albums.ente.io' : 'localhost:3002';