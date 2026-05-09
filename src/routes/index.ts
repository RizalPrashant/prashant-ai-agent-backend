import { Router } from 'express';
import healthRouter from './health';
import vapiRouter from './vapi';
import chatRouter from './chat';
import emailRouter from './email';
import calendarRouter from './calendar';

const router = Router();

router.use('/health', healthRouter);
router.use('/vapi', vapiRouter);
router.use('/chat', chatRouter);
router.use('/email', emailRouter);
router.use('/calendar', calendarRouter);

export default router;
